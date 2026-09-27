import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// Real-Postgres RLS coverage for volunteer_blocked_dates (G1.4, blockout
// dates), run as the `authenticated` role with JWT claims so the policies
// actually apply:
//  - vbd_own: a volunteer reads and writes only their own days, and only for
//    the church their profile belongs to
//    (supabase/migrations/20260927000000_volunteer_blocked_dates_policies.sql);
//  - vbd_manage: a service-plan admin manages any volunteer in their church,
//    and nothing in another church.
// Each test runs in a rolled-back transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH_A = "00000000-0000-0000-0000-0000000000a4";
const CHURCH_B = "00000000-0000-0000-0000-0000000000b4";
const VOL_USER = "00000000-0000-0000-0000-00000000e001";
const OTHER_VOL_USER = "00000000-0000-0000-0000-00000000e002";
const ADMIN_A_USER = "00000000-0000-0000-0000-00000000e003";
const ADMIN_B_USER = "00000000-0000-0000-0000-00000000e004";
// A volunteer without a login, managed only by admins.
const NO_LOGIN_PROFILE = "00000000-0000-0000-0000-00000000e005";
// A church B volunteer without a login.
const B_PROFILE = "00000000-0000-0000-0000-00000000e006";

describe("volunteer_blocked_dates RLS", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  /** Profile ids created for the auth users by the on_auth_user_created trigger. */
  type Ids = { vol: string; otherVol: string };

  const inRolledBackTransaction = async (testFn: (client: PoolClient, ids: Ids) => Promise<void>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `insert into public.churches (id, name, slug) values
           ($1, 'Blockout A', 'blockout-a-' || $3), ($2, 'Blockout B', 'blockout-b-' || $3)
         on conflict (id) do nothing`,
        [CHURCH_A, CHURCH_B, Date.now()],
      );
      await client.query(
        `insert into auth.users (id, email) values
           ($1, 'bo-vol@example.test'), ($2, 'bo-other@example.test'),
           ($3, 'bo-admin-a@example.test'), ($4, 'bo-admin-b@example.test')`,
        [VOL_USER, OTHER_VOL_USER, ADMIN_A_USER, ADMIN_B_USER],
      );
      await client.query(
        `insert into public.church_memberships (church_id, user_id, role) values
           ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'church_admin'), ($2, $6, 'church_admin')`,
        [CHURCH_A, CHURCH_B, VOL_USER, OTHER_VOL_USER, ADMIN_A_USER, ADMIN_B_USER],
      );
      // Make sure both volunteers' profiles are church A's, whatever the sync did.
      await client.query(`update public.profiles set church_id = $1 where user_id in ($2, $3)`, [CHURCH_A, VOL_USER, OTHER_VOL_USER]);
      await client.query(
        `insert into public.profiles (id, church_id, full_name) values ($1, $2, 'No Login'), ($3, $4, 'B Volunteer')`,
        [NO_LOGIN_PROFILE, CHURCH_A, B_PROFILE, CHURCH_B],
      );
      const profiles = await client.query<{ id: string; user_id: string }>(
        `select id, user_id from public.profiles where user_id in ($1, $2)`,
        [VOL_USER, OTHER_VOL_USER],
      );
      const byUser = Object.fromEntries(profiles.rows.map((r) => [r.user_id, r.id]));
      await testFn(client, { vol: byUser[VOL_USER], otherVol: byUser[OTHER_VOL_USER] });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  /** Runs `sql` as an authenticated user inside a savepoint, so a denied write doesn't abort the test's transaction. */
  async function asUser(client: PoolClient, userId: string, sql: string, values: unknown[]) {
    await client.query("savepoint as_user");
    await client.query(`set local role authenticated`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    try {
      const result = await client.query(sql, values);
      await client.query("release savepoint as_user");
      return { rows: result.rows, rowCount: result.rowCount, error: null as string | null };
    } catch (error) {
      await client.query("rollback to savepoint as_user");
      return { rows: [], rowCount: 0, error: (error as Error).message };
    } finally {
      await client.query(`reset role`);
    }
  }

  const INSERT = `insert into public.volunteer_blocked_dates (church_id, profile_id, blocked_date) values ($1, $2, $3) returning id`;
  const COUNT = `select count(*)::int as n from public.volunteer_blocked_dates where profile_id = $1`;

  it("a volunteer adds, reads and removes their own days", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      expect((await asUser(client, VOL_USER, INSERT, [CHURCH_A, ids.vol, "2026-11-01"])).error).toBeNull();
      expect((await asUser(client, VOL_USER, COUNT, [ids.vol])).rows[0].n).toBe(1);
      const removed = await asUser(client, VOL_USER, `delete from public.volunteer_blocked_dates where profile_id = $1`, [ids.vol]);
      expect(removed.rowCount).toBe(1);
    });
  });

  it("a volunteer can't write for someone else, or tag their own day with another church", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      expect((await asUser(client, VOL_USER, INSERT, [CHURCH_A, ids.otherVol, "2026-11-01"])).error).toMatch(/row-level security/);
      expect((await asUser(client, VOL_USER, INSERT, [CHURCH_B, ids.vol, "2026-11-01"])).error).toMatch(/row-level security/);
    });
  });

  it("a volunteer can't see or delete someone else's days", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      await client.query(INSERT, [CHURCH_A, ids.otherVol, "2026-11-01"]);
      expect((await asUser(client, VOL_USER, COUNT, [ids.otherVol])).rows[0].n).toBe(0);
      const removed = await asUser(client, VOL_USER, `delete from public.volunteer_blocked_dates where profile_id = $1`, [ids.otherVol]);
      expect(removed.rowCount).toBe(0);
      expect((await client.query(COUNT, [ids.otherVol])).rows[0].n).toBe(1);
    });
  });

  it("a church admin manages any volunteer in their church, including one without a login", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      expect((await asUser(client, ADMIN_A_USER, INSERT, [CHURCH_A, NO_LOGIN_PROFILE, "2026-11-01"])).error).toBeNull();
      await client.query(INSERT, [CHURCH_A, ids.vol, "2026-11-02"]);
      expect((await asUser(client, ADMIN_A_USER, COUNT, [ids.vol])).rows[0].n).toBe(1);
    });
  });

  it("another church's admin can't read or write church A's days", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      await client.query(INSERT, [CHURCH_A, ids.vol, "2026-11-01"]);
      expect((await asUser(client, ADMIN_B_USER, COUNT, [ids.vol])).rows[0].n).toBe(0);
      expect((await asUser(client, ADMIN_B_USER, INSERT, [CHURCH_A, NO_LOGIN_PROFILE, "2026-11-03"])).error).toMatch(
        /row-level security/,
      );
    });
  });

  it("an admin can't plant a day on another church's volunteer, even tagged with their own church (Council Review 20)", async () => {
    await inRolledBackTransaction(async (client) => {
      // Church A's admin, church A's id, church B's volunteer: refused.
      expect((await asUser(client, ADMIN_A_USER, INSERT, [CHURCH_A, B_PROFILE, "2026-12-25"])).error).toMatch(
        /row-level security/,
      );
      // So church B's admin can still record that volunteer's day.
      expect((await asUser(client, ADMIN_B_USER, INSERT, [CHURCH_B, B_PROFILE, "2026-12-25"])).error).toBeNull();
    });
  });

  it("an admin doesn't see a mis-tagged row for a volunteer outside their church", async () => {
    await inRolledBackTransaction(async (client) => {
      // A row that could only exist from before this policy: church A's id, church B's volunteer.
      await client.query(INSERT, [CHURCH_A, B_PROFILE, "2026-12-26"]);
      expect((await asUser(client, ADMIN_A_USER, COUNT, [B_PROFILE])).rows[0].n).toBe(0);
    });
  });
});
