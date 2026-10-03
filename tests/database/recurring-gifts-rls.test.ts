import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// Real-Postgres RLS coverage for recurring_gifts (G3.1,
// supabase/migrations/20261004000000_recurring_gifts.sql): a member reads
// their own recurring gifts, a church's managers read their church's, and
// no client writes them (only the server, with the church-scoped admin
// client). Also: one donation per Stripe invoice. Each test runs in a
// rolled-back transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH_A = "00000000-0000-0000-0000-0000000000a6";
const CHURCH_B = "00000000-0000-0000-0000-0000000000b6";
const MEMBER_USER = "00000000-0000-0000-0000-00000000f101";
const OTHER_MEMBER_USER = "00000000-0000-0000-0000-00000000f102";
const ADMIN_A_USER = "00000000-0000-0000-0000-00000000f103";
const ADMIN_B_USER = "00000000-0000-0000-0000-00000000f104";

describe("recurring_gifts RLS", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  type Ids = { member: string; otherMember: string };

  const inRolledBackTransaction = async (testFn: (client: PoolClient, ids: Ids) => Promise<void>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `insert into public.churches (id, name, slug) values
           ($1, 'Recurring A', 'recurring-a-' || $3), ($2, 'Recurring B', 'recurring-b-' || $3)
         on conflict (id) do nothing`,
        [CHURCH_A, CHURCH_B, Date.now()],
      );
      await client.query(
        `insert into auth.users (id, email) values
           ($1, 'rg-member@example.test'), ($2, 'rg-other@example.test'),
           ($3, 'rg-admin-a@example.test'), ($4, 'rg-admin-b@example.test')`,
        [MEMBER_USER, OTHER_MEMBER_USER, ADMIN_A_USER, ADMIN_B_USER],
      );
      await client.query(
        `insert into public.church_memberships (church_id, user_id, role) values
           ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'church_admin'), ($2, $6, 'church_admin')`,
        [CHURCH_A, CHURCH_B, MEMBER_USER, OTHER_MEMBER_USER, ADMIN_A_USER, ADMIN_B_USER],
      );
      await client.query(`update public.profiles set church_id = $1 where user_id in ($2, $3)`, [CHURCH_A, MEMBER_USER, OTHER_MEMBER_USER]);
      const profiles = await client.query<{ id: string; user_id: string }>(
        `select id, user_id from public.profiles where user_id in ($1, $2)`,
        [MEMBER_USER, OTHER_MEMBER_USER],
      );
      const byUser = Object.fromEntries(profiles.rows.map((r) => [r.user_id, r.id]));
      const ids = { member: byUser[MEMBER_USER], otherMember: byUser[OTHER_MEMBER_USER] };
      await client.query(
        `insert into public.recurring_gifts (church_id, profile_id, amount_cents, frequency, start_date, status)
         values ($1, $2, 2500, 'monthly', current_date, 'active'), ($1, $3, 5000, 'weekly', current_date, 'active')`,
        [CHURCH_A, ids.member, ids.otherMember],
      );
      await testFn(client, ids);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  async function as(client: PoolClient, role: "authenticated" | "anon", userId: string | null, sql: string, values: unknown[]) {
    await client.query("savepoint as_role");
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role } : { role })]);
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

  const AMOUNTS = `select amount_cents from public.recurring_gifts where church_id = $1 order by amount_cents`;

  it("a member reads only their own recurring gifts", async () => {
    await inRolledBackTransaction(async (client) => {
      expect((await as(client, "authenticated", MEMBER_USER, AMOUNTS, [CHURCH_A])).rows).toEqual([{ amount_cents: 2500 }]);
    });
  });

  it("a church admin reads the church's; another church's admin reads none", async () => {
    await inRolledBackTransaction(async (client) => {
      expect((await as(client, "authenticated", ADMIN_A_USER, AMOUNTS, [CHURCH_A])).rows).toEqual([{ amount_cents: 2500 }, { amount_cents: 5000 }]);
      expect((await as(client, "authenticated", ADMIN_B_USER, AMOUNTS, [CHURCH_A])).rows).toEqual([]);
    });
  });

  it("a manager can't read an anonymous gift directly: its profile_id would name the giver (PR #177 review)", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      await client.query(`update public.recurring_gifts set is_anonymous = true where profile_id = $1`, [ids.otherMember]);
      expect((await as(client, "authenticated", ADMIN_A_USER, AMOUNTS, [CHURCH_A])).rows).toEqual([{ amount_cents: 2500 }]);
      // The giver still reads their own anonymous gift.
      expect((await as(client, "authenticated", OTHER_MEMBER_USER, AMOUNTS, [CHURCH_A])).rows).toEqual([{ amount_cents: 5000 }]);
    });
  });

  it("anon can't read it at all", async () => {
    await inRolledBackTransaction(async (client) => {
      expect((await as(client, "anon", null, AMOUNTS, [CHURCH_A])).error).toMatch(/permission denied/);
    });
  });

  it("no client writes: not the member's own gift, not even an admin", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      const update = await as(client, "authenticated", MEMBER_USER, `update public.recurring_gifts set amount_cents = 1 where profile_id = $1`, [ids.member]);
      expect(update.rowCount ?? 0).toBe(0);
      const insert = await as(
        client,
        "authenticated",
        ADMIN_A_USER,
        `insert into public.recurring_gifts (church_id, profile_id, amount_cents, frequency, start_date) values ($1, $2, 100, 'monthly', current_date)`,
        [CHURCH_A, ids.member],
      );
      expect(insert.error).toMatch(/row-level security|permission denied/);
      const remove = await as(client, "authenticated", ADMIN_A_USER, `delete from public.recurring_gifts where church_id = $1`, [CHURCH_A]);
      expect(remove.rowCount ?? 0).toBe(0);
    });
  });

  it("records one donation per Stripe invoice", async () => {
    await inRolledBackTransaction(async (client) => {
      const insert = `insert into public.donations (church_id, amount_cents, status, stripe_invoice_id) values ($1, 2500, 'pending', 'in_rls_1')`;
      await client.query(insert, [CHURCH_A]);
      await expect(client.query(insert, [CHURCH_A])).rejects.toThrow(/duplicate key/);
    });
  });
});
