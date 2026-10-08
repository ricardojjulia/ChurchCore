import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// G4.1 / Council Review 45 (R1, R2): import staging (import_batches and
// import_batch_rows) is church-admin only, and a batch can be claimed once
// (dry_run_completed -> committing). Migration 20261008010000.
// Each test runs in a rolled-back transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH_A = "00000000-0000-0000-0000-0000000000a6";
const CHURCH_B = "00000000-0000-0000-0000-0000000000b6";
const ADMIN_A = "00000000-0000-0000-0000-00000000a601";
const ADMIN_B = "00000000-0000-0000-0000-00000000a602";
const PASTOR_A = "00000000-0000-0000-0000-00000000a603";
const LEADER_A = "00000000-0000-0000-0000-00000000a604";
const MEMBER_A = "00000000-0000-0000-0000-00000000a605";
const BATCH_A = "00000000-0000-0000-0000-00000000a611";
const ROW_A = "00000000-0000-0000-0000-00000000a621";

describe("import staging RLS (R1, R2)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  const inRolledBackTransaction = async (testFn: (client: PoolClient) => Promise<void>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `insert into public.churches (id, name, slug) values
           ($1, 'Staging A', 'staging-a-' || $3), ($2, 'Staging B', 'staging-b-' || $3)
         on conflict (id) do nothing`,
        [CHURCH_A, CHURCH_B, Date.now()],
      );
      await client.query(
        `insert into auth.users (id, email) values
           ($1, 'stg-admin-a@example.test'), ($2, 'stg-admin-b@example.test'), ($3, 'stg-pastor@example.test'),
           ($4, 'stg-leader@example.test'), ($5, 'stg-member@example.test')`,
        [ADMIN_A, ADMIN_B, PASTOR_A, LEADER_A, MEMBER_A],
      );
      await client.query(
        `insert into public.church_memberships (church_id, user_id, role) values
           ($1, $3, 'church_admin'), ($2, $4, 'church_admin'), ($1, $5, 'pastor'), ($1, $6, 'ministry_leader'), ($1, $7, 'member')`,
        [CHURCH_A, CHURCH_B, ADMIN_A, ADMIN_B, PASTOR_A, LEADER_A, MEMBER_A],
      );
      await client.query(
        `insert into public.import_batches (id, church_id, import_type, source_system, source_filename, status)
         values ($1, $2, 'giving_csv', 'breeze', 'seed.csv', 'dry_run_completed')`,
        [BATCH_A, CHURCH_A],
      );
      await client.query(
        `insert into public.import_batch_rows (id, batch_id, church_id, row_number, raw_payload, normalized_payload, classification)
         values ($1, $2, $3, 2, '{}', '{}', 'create')`,
        [ROW_A, BATCH_A, CHURCH_A],
      );
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  async function as(client: PoolClient, role: "authenticated" | "anon", userId: string | null, sql: string, values: unknown[] = []) {
    await client.query("savepoint as_role");
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ]);
    try {
      const result = await client.query(sql, values);
      await client.query("release savepoint as_role");
      return { rows: result.rows, rowCount: result.rowCount ?? 0, error: null as string | null };
    } catch (error) {
      await client.query("rollback to savepoint as_role");
      return { rows: [], rowCount: 0, error: (error as Error).message };
    } finally {
      await client.query(`reset role`);
    }
  }

  const INSERT_BATCH = `insert into public.import_batches (church_id, import_type, source_system, source_filename, status)
                        values ($1, 'giving_csv', 'breeze', 'x.csv', 'dry_run_completed')`;
  const INSERT_ROW = `insert into public.import_batch_rows (batch_id, church_id, row_number, raw_payload, normalized_payload, classification)
                      values ($1, $2, 3, '{}', '{"profileId":"x"}', 'create')`;
  const UPDATE_BATCH = `update public.import_batches set summary = '{"x":1}' where id = $1`;
  const UPDATE_ROW = `update public.import_batch_rows set normalized_payload = '{"profileId":"planted"}' where id = $1`;

  it("a church admin can insert, read and update batches and insert and read rows", async () => {
    await inRolledBackTransaction(async (client) => {
      expect((await as(client, "authenticated", ADMIN_A, INSERT_BATCH, [CHURCH_A])).error).toBeNull();
      expect((await as(client, "authenticated", ADMIN_A, INSERT_ROW, [BATCH_A, CHURCH_A])).error).toBeNull();
      expect((await as(client, "authenticated", ADMIN_A, UPDATE_BATCH, [BATCH_A])).rowCount).toBe(1);
      expect((await as(client, "authenticated", ADMIN_A, `select id from public.import_batches where church_id = $1`, [CHURCH_A])).rows.length).toBeGreaterThan(0);
      expect((await as(client, "authenticated", ADMIN_A, `select id from public.import_batch_rows where id = $1`, [ROW_A])).rows).toHaveLength(1);
    });
  });

  it("a pastor and a ministry leader cannot insert or update a batch or a row, or read them", async () => {
    await inRolledBackTransaction(async (client) => {
      for (const user of [PASTOR_A, LEADER_A, MEMBER_A]) {
        expect((await as(client, "authenticated", user, INSERT_BATCH, [CHURCH_A])).error).toMatch(/row-level security/);
        expect((await as(client, "authenticated", user, INSERT_ROW, [BATCH_A, CHURCH_A])).error).toMatch(/row-level security/);
        expect((await as(client, "authenticated", user, UPDATE_BATCH, [BATCH_A])).rowCount).toBe(0);
        // There is no update policy on rows at all.
        expect((await as(client, "authenticated", user, UPDATE_ROW, [ROW_A])).rowCount).toBe(0);
        expect((await as(client, "authenticated", user, `select id from public.import_batches where id = $1`, [BATCH_A])).rows).toEqual([]);
        expect((await as(client, "authenticated", user, `select id from public.import_batch_rows where id = $1`, [ROW_A])).rows).toEqual([]);
      }
    });
  });

  it("an admin of another church touches nothing here, and anon has no access", async () => {
    await inRolledBackTransaction(async (client) => {
      expect((await as(client, "authenticated", ADMIN_B, INSERT_BATCH, [CHURCH_A])).error).toMatch(/row-level security/);
      expect((await as(client, "authenticated", ADMIN_B, UPDATE_BATCH, [BATCH_A])).rowCount).toBe(0);
      expect((await as(client, "authenticated", ADMIN_B, `select id from public.import_batch_rows where id = $1`, [ROW_A])).rows).toEqual([]);
      expect((await as(client, "anon", null, `select id from public.import_batches`)).error).toMatch(/permission denied/);
      expect((await as(client, "anon", null, INSERT_BATCH, [CHURCH_A])).error).toMatch(/permission denied/);
    });
  });

  it("a batch can be claimed once: the second conditional update matches no row", async () => {
    await inRolledBackTransaction(async (client) => {
      const claim = `update public.import_batches set status = 'committing'
                      where id = $1 and church_id = $2 and status = 'dry_run_completed' and dry_run returning id`;
      expect((await as(client, "authenticated", ADMIN_A, claim, [BATCH_A, CHURCH_A])).rowCount).toBe(1);
      expect((await as(client, "authenticated", ADMIN_A, claim, [BATCH_A, CHURCH_A])).rowCount).toBe(0);
    });
  });

  it("rejects a status outside the allowed set but accepts committing", async () => {
    await inRolledBackTransaction(async (client) => {
      expect((await client.query(`update public.import_batches set status = 'committing' where id = $1`, [BATCH_A])).rowCount).toBe(1);
      await client.query("savepoint s");
      await expect(client.query(`update public.import_batches set status = 'bogus' where id = $1`, [BATCH_A])).rejects.toThrow(/status_check/);
      await client.query("rollback to savepoint s");
    });
  });
});
