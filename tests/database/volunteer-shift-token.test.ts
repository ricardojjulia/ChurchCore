import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// Council Review 23: every member of a church could read every volunteer's
// confirm token (volunteer_shifts.confirmation_token) through PostgREST, then
// decline someone else's shift or read their schedule from the token links.
// Migration 20260929010000 hides the column from members; the app reads it
// only through the admin client. Run as the `authenticated` role with a real
// member's JWT claims; each test runs in a rolled-back transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH = "00000000-0000-0000-0000-0000000000c9";
const MEMBER_USER = "00000000-0000-0000-0000-00000000f301";
const OTHER_VOLUNTEER = "00000000-0000-0000-0000-00000000f302";
const SHIFT = "00000000-0000-0000-0000-00000000f303";
const EVENT = "00000000-0000-0000-0000-00000000f304";

describe("volunteer confirm tokens under RLS (Council Review 23)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function inRolledBackTransaction(testFn: (client: PoolClient) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`insert into public.churches (id, name, slug) values ($1, 'Token Church', 'token-church-' || $2)`, [
        CHURCH,
        Date.now(),
      ]);
      await client.query(`insert into auth.users (id, email) values ($1, 'token-member@example.test')`, [MEMBER_USER]);
      await client.query(`insert into public.church_memberships (church_id, user_id, role) values ($1, $2, 'member')`, [
        CHURCH,
        MEMBER_USER,
      ]);
      await client.query(`update public.profiles set church_id = $1 where user_id = $2`, [CHURCH, MEMBER_USER]);
      await client.query(`insert into public.profiles (id, church_id, full_name) values ($1, $2, 'Other Volunteer')`, [
        OTHER_VOLUNTEER,
        CHURCH,
      ]);
      await client.query(
        `insert into public.events (id, church_id, title, starts_at, ends_at, category)
         values ($1, $2, 'Sunday', now() + interval '3 days', now() + interval '3 days 2 hours', 'general')`,
        [EVENT, CHURCH],
      );
      await client.query(
        `insert into public.volunteer_shifts
           (id, church_id, event_id, assigned_user_id, title, starts_at, ends_at, status, confirmation_status,
            confirmation_token, confirmation_token_expires_at)
         values ($1, $2, $4, $3, 'Greeter', now() + interval '3 days', now() + interval '3 days 2 hours', 'assigned', 'pending',
                 'secret-token-0000000000000000000', now() + interval '10 days')`,
        [SHIFT, CHURCH, OTHER_VOLUNTEER, EVENT],
      );
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  async function asMember(client: PoolClient, sql: string) {
    await client.query("savepoint as_member");
    await client.query(`set local role authenticated`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: MEMBER_USER, role: "authenticated" }),
    ]);
    try {
      const result = await client.query(sql);
      await client.query("release savepoint as_member");
      return { rows: result.rows, error: null as string | null };
    } catch (error) {
      await client.query("rollback to savepoint as_member");
      return { rows: [], error: (error as Error).message };
    } finally {
      await client.query(`reset role`);
    }
  }

  it("a member can't read another volunteer's confirm token", async () => {
    await inRolledBackTransaction(async (client) => {
      const res = await asMember(client, `select confirmation_token from public.volunteer_shifts where id = '${SHIFT}'`);
      expect(res.error).toMatch(/permission denied/);
    });
  });

  it("a member still reads every other column of their church's shifts (the roster and their schedule)", async () => {
    await inRolledBackTransaction(async (client) => {
      const res = await asMember(
        client,
        `select id, title, assigned_user_id, confirmation_status, confirmation_token_expires_at
         from public.volunteer_shifts where id = '${SHIFT}'`,
      );
      expect(res.error).toBeNull();
      expect(res.rows).toHaveLength(1);
    });
  });
});
