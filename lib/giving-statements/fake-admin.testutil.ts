// Test-only: a tiny in-memory stand-in for the Supabase admin client, enough
// for the giving-statement loaders, consent reads and the claim-before-send
// path. It mimics the partial unique index on communication_logs
// (church_id, segment_criteria->>'statementKey') for claimed-or-sent rows.

export type Row = Record<string, unknown>;
export type FakeError = { message: string; code?: string };

type Op = "select" | "insert" | "update";

export type FakeAdminOptions = {
  /** Return an error to make an operation on a table fail. */
  failOn?: (op: Op, table: string) => FakeError | undefined;
  now?: () => number;
};

const BLOCKING = ["sending", "queued", "sent", "delivered"];

function valueAt(row: Row, column: string): unknown {
  if (column.includes("->>")) {
    const [col, key] = column.split("->>");
    const json = row[col] as Row | null | undefined;
    return json ? json[key] : undefined;
  }
  return row[column];
}

export function createFakeAdmin(seed: Record<string, Row[]>, options: FakeAdminOptions = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const calls: Array<{ op: Op; table: string; filters: Array<[string, unknown]>; payload?: Row }> = [];
  let counter = 0;
  const now = options.now ?? Date.now;

  function from(table: string) {
    tables[table] ??= [];
    let op: Op = "select";
    let payload: Row = {};
    const filters: Array<(row: Row) => boolean> = [];
    const logged: Array<[string, unknown]> = [];
    let limitRange: [number, number] | null = null;
    const order: Array<[string, boolean]> = [];
    let returning = false;
    let single = false;

    const execute = (): { data: unknown; error: FakeError | null } => {
      const failure = options.failOn?.(op, table);
      calls.push({ op, table, filters: logged, payload: op === "select" ? undefined : payload });
      if (failure) return { data: null, error: failure };
      const rows = tables[table];

      if (op === "insert") {
        const row: Row = { id: `${table}-${++counter}`, created_at: new Date(now()).toISOString(), ...payload };
        const key = valueAt(row, "segment_criteria->>statementKey");
        if (table === "communication_logs" && key !== undefined && BLOCKING.includes(String(row.status))) {
          const clash = rows.some(
            (r) =>
              r.church_id === row.church_id &&
              valueAt(r, "segment_criteria->>statementKey") === key &&
              BLOCKING.includes(String(r.status)),
          );
          if (clash) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        }
        rows.push(row);
        return { data: single ? row : [row], error: null };
      }

      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        return { data: returning ? matched : null, error: null };
      }
      for (const [col, asc] of order.slice().reverse()) {
        matched = matched.slice().sort((a, b) => {
          const av = String(valueAt(a, col) ?? "");
          const bv = String(valueAt(b, col) ?? "");
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (limitRange) matched = matched.slice(limitRange[0], limitRange[1] + 1);
      if (single) {
        if (matched.length !== 1) return { data: null, error: { message: "not found", code: "PGRST116" } };
        return { data: matched[0], error: null };
      }
      return { data: matched, error: null };
    };

    const builder: Record<string, unknown> = {
      select() {
        if (op !== "select") returning = true;
        return builder;
      },
      insert(row: Row) {
        op = "insert";
        payload = row;
        return builder;
      },
      update(patch: Row) {
        op = "update";
        payload = patch;
        return builder;
      },
      eq(col: string, value: unknown) {
        logged.push([col, value]);
        filters.push((r) => valueAt(r, col) === value);
        return builder;
      },
      in(col: string, values: unknown[]) {
        logged.push([col, values]);
        filters.push((r) => values.includes(valueAt(r, col)));
        return builder;
      },
      gte(col: string, value: string) {
        logged.push([col, value]);
        filters.push((r) => String(valueAt(r, col)) >= value);
        return builder;
      },
      lt(col: string, value: string) {
        logged.push([col, value]);
        filters.push((r) => String(valueAt(r, col)) < value);
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        order.push([col, opts?.ascending !== false]);
        return builder;
      },
      range(from: number, to: number) {
        limitRange = [from, to];
        return builder;
      },
      single() {
        single = true;
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
    return builder;
  }

  return { client: { from } as never, tables, calls };
}
