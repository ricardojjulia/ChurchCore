// A small in-memory stand-in for the PostgREST client, for unit tests of code
// that talks to Supabase through chained builders (select / insert / update /
// delete with eq, in, is, not, gte, lt, order, limit, single, maybeSingle).
// It does NOT check column names or RLS: the real schema is covered by
// tests/database and the e2e suite. Use `calls` to assert what was written.

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type DbError = { code?: string; message: string } | null;

export type FakeSupabaseOptions = {
  tables?: Record<string, Row[]>;
  /** Return an error to make an insert into `table` fail (e.g. { code: "23505" }). */
  insertError?: (table: string, row: Row, existing: Row[]) => DbError;
  /** Return an error to make any read/update/delete on `table` fail. */
  tableError?: (table: string, op: "select" | "update" | "delete" | "insert") => DbError;
  /** Column defaults a real table would apply on insert (e.g. status). */
  defaults?: Record<string, Row>;
  rpc?: Record<string, () => { data: unknown; error: DbError }>;
};

export type FakeCall = { table: string; op: string; payload?: unknown; filters: string[] };

export function createFakeSupabase(options: FakeSupabaseOptions = {}) {
  const tables: Record<string, Row[]> = options.tables ?? {};
  const calls: FakeCall[] = [];

  function rows(table: string) {
    tables[table] ??= [];
    return tables[table];
  }

  function from(table: string) {
    const filters: Filter[] = [];
    const filterLabels: string[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: unknown;
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    let wantsReturn = false;

    const matches = (row: Row) => filters.every((f) => f(row));

    function execute(): { data: Row[] | null; error: DbError } {
      const forcedError = options.tableError?.(table, op);
      if (forcedError) return { data: null, error: forcedError };

      if (op === "insert") {
        const incoming = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const inserted: Row[] = [];
        for (const raw of incoming) {
          const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...options.defaults?.[table], ...raw };
          const error = options.insertError?.(table, row, rows(table)) ?? null;
          if (error) return { data: null, error };
          rows(table).push(row);
          inserted.push(row);
        }
        calls.push({ table, op, payload, filters: filterLabels });
        return { data: wantsReturn ? inserted : null, error: null };
      }

      if (op === "update") {
        const hit = rows(table).filter(matches);
        for (const row of hit) Object.assign(row, payload as Row);
        calls.push({ table, op, payload, filters: filterLabels });
        return { data: wantsReturn ? hit : null, error: null };
      }

      if (op === "delete") {
        const hit = rows(table).filter(matches);
        tables[table] = rows(table).filter((row) => !hit.includes(row));
        calls.push({ table, op, filters: filterLabels });
        return { data: wantsReturn ? hit : null, error: null };
      }

      let result = rows(table).filter(matches);
      if (order) {
        const { column, ascending } = order;
        result = [...result].sort((a, b) => {
          const x = String(a[column] ?? "");
          const y = String(b[column] ?? "");
          return ascending ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (limit !== null) result = result.slice(0, limit);
      calls.push({ table, op, filters: filterLabels });
      return { data: result.map((r) => ({ ...r })), error: null };
    }

    const builder: Record<string, unknown> = {
      select() {
        if (op !== "select") wantsReturn = true;
        return builder;
      },
      insert(values: unknown) {
        op = "insert";
        payload = values;
        return builder;
      },
      update(values: unknown) {
        op = "update";
        payload = values;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      eq(column: string, value: unknown) {
        filterLabels.push(`${column}=${String(value)}`);
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filterLabels.push(`${column} in`);
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      is(column: string, value: unknown) {
        filterLabels.push(`${column} is ${String(value)}`);
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      not(column: string, _operator: string, value: unknown) {
        filterLabels.push(`${column} is not ${String(value)}`);
        filters.push((row) => (row[column] ?? null) !== value);
        return builder;
      },
      gte(column: string, value: string) {
        filterLabels.push(`${column}>=`);
        filters.push((row) => String(row[column] ?? "") >= value);
        return builder;
      },
      lt(column: string, value: string) {
        filterLabels.push(`${column}<`);
        filters.push((row) => String(row[column] ?? "") < value);
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        order = { column, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      single() {
        const { data, error } = execute();
        if (error) return Promise.resolve({ data: null, error });
        if (!data || data.length !== 1) {
          return Promise.resolve({ data: null, error: { message: "expected one row" } });
        }
        return Promise.resolve({ data: data[0], error: null });
      },
      maybeSingle() {
        const { data, error } = execute();
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve({ data: data?.[0] ?? null, error: null });
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    client: {
      from,
      rpc(name: string) {
        const handler = options.rpc?.[name];
        return Promise.resolve(handler ? handler() : { data: null, error: { message: "no rpc" } });
      },
    },
    tables,
    calls,
  };
}
