import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// Real-Postgres RLS coverage for church_payment_accounts (G3.0b, ADR 0025,
// supabase/migrations/20261003000000_church_payment_accounts.sql): a church's
// admins read their own church's Stripe link; nobody else reads it, and no
// client writes it (only the server, with the church-scoped admin client).
// Each test runs in a rolled-back transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH_A = "00000000-0000-0000-0000-0000000000a5";
const CHURCH_B = "00000000-0000-0000-0000-0000000000b5";
const ADMIN_A_USER = "00000000-0000-0000-0000-00000000f001";
const ADMIN_B_USER = "00000000-0000-0000-0000-00000000f002";
const MEMBER_A_USER = "00000000-0000-0000-0000-00000000f003";
const PASTOR_A_USER = "00000000-0000-0000-0000-00000000f004";

describe("church_payment_accounts RLS", () => {
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
           ($1, 'Pay A', 'pay-a-' || $3), ($2, 'Pay B', 'pay-b-' || $3)
         on conflict (id) do nothing`,
        [CHURCH_A, CHURCH_B, Date.now()],
      );
      await client.query(
        `insert into auth.users (id, email) values
           ($1, 'pay-admin-a@example.test'), ($2, 'pay-admin-b@example.test'),
           ($3, 'pay-member-a@example.test'), ($4, 'pay-pastor-a@example.test')`,
        [ADMIN_A_USER, ADMIN_B_USER, MEMBER_A_USER, PASTOR_A_USER],
      );
      await client.query(
        `insert into public.church_memberships (church_id, user_id, role) values
           ($1, $3, 'church_admin'), ($2, $4, 'church_admin'), ($1, $5, 'member'), ($1, $6, 'pastor')`,
        [CHURCH_A, CHURCH_B, ADMIN_A_USER, ADMIN_B_USER, MEMBER_A_USER, PASTOR_A_USER],
      );
      await client.query(
        `insert into public.church_payment_accounts (church_id, stripe_account_id, charges_enabled)
         values ($1, 'acct_test_a', true), ($2, 'acct_test_b', true)`,
        [CHURCH_A, CHURCH_B],
      );
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  /** Runs `sql` as `role` (with JWT claims for `userId`) inside a savepoint, so a denied write doesn't abort the transaction. */
  async function as(client: PoolClient, role: "authenticated" | "anon", userId: string | null, sql: string, values: unknown[]) {
    await client.query("savepoint as_role");
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ]);
    try {
      const result = await client.query(sql, values);
      await client.query("release savepoint as_role");
      return { rows: result.rows, rowCount: result.rowCount, error: null as string | null };
    } catch (error) {
      await client.query("rollback to savepoint as_role");
      return { rows: [], rowCount: 0, error: (error as Error).message };
    } finally {
      await client.query(`reset role`);
    }
  }

  const READ_ALL = `select church_id, stripe_account_id from public.church_payment_accounts where church_id in ($1, $2)`;

  it("a church admin reads only their own church's link", async () => {
    await inRolledBackTransaction(async (client) => {
      const result = await as(client, "authenticated", ADMIN_A_USER, READ_ALL, [CHURCH_A, CHURCH_B]);
      expect(result.rows).toEqual([{ church_id: CHURCH_A, stripe_account_id: "acct_test_a" }]);
    });
  });

  it("a member or pastor of the church reads nothing", async () => {
    await inRolledBackTransaction(async (client) => {
      for (const user of [MEMBER_A_USER, PASTOR_A_USER]) {
        expect((await as(client, "authenticated", user, READ_ALL, [CHURCH_A, CHURCH_B])).rows).toEqual([]);
      }
    });
  });

  it("anon can't read it at all", async () => {
    await inRolledBackTransaction(async (client) => {
      expect((await as(client, "anon", null, READ_ALL, [CHURCH_A, CHURCH_B])).error).toMatch(/permission denied/);
    });
  });

  it("not even a church admin can link, relink or unlink an account from the client", async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(`delete from public.church_payment_accounts where church_id = $1`, [CHURCH_A]);
      const insert = await as(
        client,
        "authenticated",
        ADMIN_A_USER,
        `insert into public.church_payment_accounts (church_id, stripe_account_id) values ($1, 'acct_attacker')`,
        [CHURCH_A],
      );
      expect(insert.error).toMatch(/row-level security|permission denied/);

      const update = await as(
        client,
        "authenticated",
        ADMIN_B_USER,
        `update public.church_payment_accounts set stripe_account_id = 'acct_attacker' where church_id = $1`,
        [CHURCH_B],
      );
      expect(update.rowCount ?? 0).toBe(0);
      const remove = await as(client, "authenticated", ADMIN_B_USER, `delete from public.church_payment_accounts where church_id = $1`, [
        CHURCH_B,
      ]);
      expect(remove.rowCount ?? 0).toBe(0);
      const { rows } = await client.query(`select stripe_account_id from public.church_payment_accounts where church_id = $1`, [CHURCH_B]);
      expect(rows).toEqual([{ stripe_account_id: "acct_test_b" }]);
    });
  });

  it("one Stripe account links to at most one church", async () => {
    await inRolledBackTransaction(async (client) => {
      await expect(
        client.query(`update public.church_payment_accounts set stripe_account_id = 'acct_test_a' where church_id = $1`, [CHURCH_B]),
      ).rejects.toThrow(/duplicate key/);
    });
  });
});
