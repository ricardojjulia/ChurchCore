// Test-only: a small in-memory stand-in for the Supabase query builder, so the
// giving code's database steps run against real rows in unit tests. Supports
// what that code uses: select/insert/upsert/update/delete with eq, neq, in,
// is and a simple `or` of `col.is.null` / `col.lte."value"` filters.
// Imported only by tests.

type Row = Record<string, unknown>;

export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  /** Tables whose next write fails. */
  const failOn = new Set<string>();
  /** Every write, in order: [table, kind, values]. */
  const writes: Array<[string, string, unknown]> = [];
  let nextId = 1;

  function from(table: string) {
    tables[table] ??= [];
    const filters: Array<(r: Row) => boolean> = [];
    let op: { kind: "select" | "update" | "delete" | "insert" | "upsert"; values?: Row | Row[]; onConflict?: string; ignoreDuplicates?: boolean } = {
      kind: "select",
    };
    let returning = false;

    const run = (): { data: unknown; error: { message: string } | null } => {
      if (op.kind !== "select") {
        writes.push([table, op.kind, op.values]);
        if (failOn.has(table)) {
          failOn.delete(table);
          return { data: null, error: { message: `${table} write failed` } };
        }
      }
      const matched = tables[table].filter((r) => filters.every((f) => f(r)));
      if (op.kind === "update") {
        matched.forEach((r) => Object.assign(r, op.values));
        return { data: returning ? matched : null, error: null };
      }
      if (op.kind === "delete") {
        tables[table] = tables[table].filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }
      if (op.kind === "insert" || op.kind === "upsert") {
        const added: Row[] = [];
        for (const values of Array.isArray(op.values) ? op.values : [op.values ?? {}]) {
          const key = op.onConflict;
          const existing = key ? tables[table].find((r) => r[key] !== undefined && r[key] === values[key]) : undefined;
          if (existing) {
            if (op.kind === "upsert" && !op.ignoreDuplicates) Object.assign(existing, values);
            continue;
          }
          const row = { id: `${table}-${nextId++}`, ...values };
          tables[table].push(row);
          added.push(row);
        }
        return { data: returning ? added : null, error: null };
      }
      return { data: matched, error: null };
    };

    const single = async () => {
      const { data, error } = run();
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
    };

    const chain: Record<string, unknown> = {
      select: () => ((returning = op.kind !== "select" || returning), chain),
      insert: (values: Row | Row[]) => ((op = { kind: "insert", values }), chain),
      upsert: (values: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) => (
        (op = { kind: "upsert", values, ...options }), chain
      ),
      update: (values: Row) => ((op = { kind: "update", values }), chain),
      delete: () => ((op = { kind: "delete" }), chain),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), chain),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), chain),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), chain),
      or: (expression: string) => {
        const clauses = expression.split(/,(?=[a-z_]+\.)/).map((clause) => {
          const [column, operator, ...rest] = clause.split(".");
          const value = rest.join(".").replace(/^"|"$/g, "");
          return (r: Row) =>
            operator === "is" ? (r[column] ?? null) === null : operator === "lte" ? String(r[column]) <= value : false;
        });
        filters.push((r) => clauses.some((test) => test(r)));
        return chain;
      },
      order: () => chain,
      maybeSingle: single,
      single,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  }
  return { client: { from } as never, tables, failOn, writes };
}
