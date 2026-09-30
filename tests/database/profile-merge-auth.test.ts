import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// Council Review 26: merge_duplicate_profile (SECURITY DEFINER) compared
// church_memberships.user_id — a login id — with its actor_profile_id
// argument. Every real admin failed the check, and anyone who passed an
// admin's login id as the actor passed it. The actor is now auth.uid().
// Run as the `authenticated` role with JWT claims; each test is rolled back.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH = "00000000-0000-0000-0000-0000000000d6";
const ADMIN_USER = "00000000-0000-0000-0000-00000000d601";
const MEMBER_USER = "00000000-0000-0000-0000-00000000d602";
const SOURCE_USER = "00000000-0000-0000-0000-00000000d603";
const TARGET_PROFILE = "00000000-0000-0000-0000-00000000d611";

describe("merging duplicate profiles (Council Review 26)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  type Ids = { adminProfile: string; memberProfile: string; sourceProfile: string };

  async function inRolledBackTransaction(testFn: (client: PoolClient, ids: Ids) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`insert into public.churches (id, name, slug) values ($1, 'Merge Church', 'merge-church-' || $2)`, [
        CHURCH,
        Date.now(),
      ]);
      for (const [id, email] of [
        [ADMIN_USER, "merge-admin@example.test"],
        [MEMBER_USER, "merge-member@example.test"],
        [SOURCE_USER, "merge-source@example.test"],
      ]) {
        await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
      }
      await client.query(
        `insert into public.church_memberships (church_id, user_id, role) values
           ($1, $2, 'church_admin'), ($1, $3, 'member'), ($1, $4, 'member')`,
        [CHURCH, ADMIN_USER, MEMBER_USER, SOURCE_USER],
      );
      // Sign-up creates each login's profile; put them in this church.
      await client.query(`update public.profiles set church_id = $1 where user_id = any($2::uuid[])`, [
        CHURCH,
        [ADMIN_USER, MEMBER_USER, SOURCE_USER],
      ]);
      await client.query(`update public.profiles set role = 'church_admin' where user_id = $1`, [ADMIN_USER]);
      await client.query(`insert into public.profiles (id, church_id, full_name) values ($1, $2, 'Target Person')`, [
        TARGET_PROFILE,
        CHURCH,
      ]);
      const ids = await client.query<{ user_id: string; id: string }>(
        `select user_id, id from public.profiles where user_id = any($1::uuid[])`,
        [[ADMIN_USER, MEMBER_USER, SOURCE_USER]],
      );
      const byUser = new Map(ids.rows.map((r) => [r.user_id, r.id]));
      await testFn(client, {
        adminProfile: byUser.get(ADMIN_USER)!,
        memberProfile: byUser.get(MEMBER_USER)!,
        sourceProfile: byUser.get(SOURCE_USER)!,
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  async function mergeAs(client: PoolClient, userId: string, source: string, target: string, actor: string | null) {
    await client.query("savepoint merge_as");
    await client.query(`set local role authenticated`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    try {
      await client.query(`select public.merge_duplicate_profile($1, $2, $3)`, [source, target, actor]);
      await client.query("release savepoint merge_as");
      return null;
    } catch (error) {
      await client.query("rollback to savepoint merge_as");
      return (error as Error).message;
    } finally {
      await client.query(`reset role`);
    }
  }

  it("a church admin merges a duplicate, and the person's sign-in moves to the kept profile", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      await client.query(`update public.profiles set email = 'source@example.test' where id = $1`, [ids.sourceProfile]);
      expect(await mergeAs(client, ADMIN_USER, ids.sourceProfile, TARGET_PROFILE, ids.adminProfile)).toBeNull();

      const rows = await client.query<{ id: string; user_id: string | null; merged_into_profile_id: string | null; email: string | null }>(
        `select id, user_id, merged_into_profile_id, email from public.profiles where id = any($1::uuid[])`,
        [[ids.sourceProfile, TARGET_PROFILE]],
      );
      const source = rows.rows.find((r) => r.id === ids.sourceProfile)!;
      const target = rows.rows.find((r) => r.id === TARGET_PROFILE)!;
      expect(source).toMatchObject({ merged_into_profile_id: TARGET_PROFILE, user_id: null, email: null });
      // The login and the email now belong to the kept profile; the membership is untouched.
      expect(target).toMatchObject({ user_id: SOURCE_USER, email: "source@example.test" });
      const membership = await client.query(
        `select is_active from public.church_memberships where church_id = $1 and user_id = $2`,
        [CHURCH, SOURCE_USER],
      );
      expect(membership.rows[0].is_active).toBe(true);
    });
  });

  it("refuses to merge two profiles that each have their own sign-in", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      expect(await mergeAs(client, ADMIN_USER, ids.sourceProfile, ids.memberProfile, ids.adminProfile)).toMatch(
        /Both profiles have their own sign-in/,
      );
    });
  });

  it("a member can't merge, even passing an admin's login id or profile id as the actor", async () => {
    await inRolledBackTransaction(async (client, ids) => {
      for (const actor of [ADMIN_USER, ids.adminProfile, ids.memberProfile]) {
        expect(await mergeAs(client, MEMBER_USER, ids.sourceProfile, TARGET_PROFILE, actor)).toMatch(
          /Only church admins or pastors can merge/,
        );
      }
      const merged = await client.query(`select merged_at from public.profiles where id = $1`, [ids.sourceProfile]);
      expect(merged.rows[0].merged_at).toBeNull();
    });
  });

  it("signed-out callers can't run it at all", async () => {
    const grants = await pool.query(
      `select grantee from information_schema.routine_privileges where routine_name = 'merge_duplicate_profile'`,
    );
    const grantees = grants.rows.map((r) => r.grantee);
    expect(grantees).toContain("authenticated");
    expect(grantees).not.toContain("anon");
    expect(grantees).not.toContain("PUBLIC");
  });
});
