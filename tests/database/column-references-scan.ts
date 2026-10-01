import ts from "typescript";

// Finds Supabase column references in source, via the TypeScript AST (PR #168
// review: the first version's regexes missed single-quoted names, template
// selects and array inserts):
//   .from("t").update|insert|upsert({ ...columns })  or  ([{ ... }, ...])
//   .from("t").select("a, b, rel(c)")
// Table names and selects may be any string literal or a template with no
// substitutions. Payloads built elsewhere (a variable) and templates with
// substitutions can't be read statically; they're counted as `unchecked`.

export type ColumnReference = {
  file: string;
  line: number;
  table: string;
  columns: string[];
  kind: "write" | "select";
};

export type ScanResult = { references: ColumnReference[]; unchecked: number };

const WRITE_METHODS = new Set(["update", "insert", "upsert"]);

function literalText(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function objectKeys(node: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = [];
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = property.name;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) keys.push(name.text);
    }
  }
  return keys;
}

// Top-level column names of a PostgREST select string: an embedded relation
// (`rel(...)`, `alias:rel!fk(...)`) is skipped whole; `alias:column` keeps the
// column.
export function selectColumns(select: string): string[] {
  let depth = 0;
  let current = "";
  let isEmbed = false;
  const parts: string[] = [];
  for (const ch of select) {
    if (ch === "(") {
      if (depth === 0) isEmbed = true;
      depth++;
    } else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      if (!isEmbed) parts.push(current);
      current = "";
      isEmbed = false;
    } else if (depth === 0) current += ch;
  }
  if (!isEmbed) parts.push(current);
  return parts
    .map((part) => part.trim())
    .filter((part) => part && part !== "*")
    .map((part) => part.split(":").pop()!.split("!")[0].split("::")[0].trim())
    .filter((part) => /^\w+$/.test(part));
}

export function scanSource(file: string, source: string): ScanResult {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const references: ColumnReference[] = [];
  let unchecked = 0;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (WRITE_METHODS.has(node.expression.name.text) || node.expression.name.text === "select")
    ) {
      const fromCall = node.expression.expression;
      if (
        ts.isCallExpression(fromCall) &&
        ts.isPropertyAccessExpression(fromCall.expression) &&
        fromCall.expression.name.text === "from"
      ) {
        const table = literalText(fromCall.arguments[0]);
        const method = node.expression.name.text;
        const argument = node.arguments[0];
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        if (table && method === "select") {
          const select = literalText(argument);
          if (select !== null) references.push({ file, line, table, columns: selectColumns(select), kind: "select" });
          else if (argument) unchecked++;
        } else if (table && argument) {
          const rows = ts.isArrayLiteralExpression(argument) ? [...argument.elements] : [argument];
          for (const row of rows) {
            if (ts.isObjectLiteralExpression(row)) {
              references.push({ file, line, table, columns: objectKeys(row), kind: "write" });
            } else {
              unchecked++;
            }
          }
        } else if (!table) {
          unchecked++;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { references, unchecked };
}
