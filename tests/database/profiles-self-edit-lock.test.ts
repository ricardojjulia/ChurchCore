import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// S5 (Council Reviews 18, 21, 22), migration 20260930010000:
// - a member can't change protected columns on their own profile (role,
//   church, login, membership status, data-rights approval, pastoral flag,
//   safety clearance, …), but can still edit their own contact details;
// - current_user_role() reads church_memberships, not profiles.role;
// - /hq's tables are platform-admin only.
// Run as `authenticated` with JWT claims; each test is rolled back.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH = "00000000-0000-0000-0000-0000000000e5";
const MEMBER = "00000000-0000-0000-0000-00000000e501";
const ADMIN = "00000000-0000-0000-0000-00000000e502";
const SECRETARY = "00000000-0000-0000-0000-00000000e503";
const PLATFORM = "00000000-0000-0000-0000-00000000e504";
const LEADER = "00000000-0000-0000-0000-00000000e505";

describe("S5: self-edit lock, membership roles, platform-only /hq", () => {
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
      await client.query(`insert into public.churches (id, name, slug) values ($1, 'Lock Church', 'lock-church-' || $2)`, [
        CHURCH,
        Date.now(),
      ]);
      for (const [id, email] of [
        [MEMBER, "lock-member@example.test"],
        [ADMIN, "lock-admin@example.test"],
        [SECRETARY, "lock-secretary@example.test"],
        [PLATFORM, "lock-platform@example.test"],
        [LEADER, "lock-leader@example.test"],
      ]) {
        await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
      }
      await client.query(
        `insert into public.church_memberships (church_id, user_id, role) values
           ($1, $2, 'member'), ($1, $3, 'church_admin'), ($1, $4, 'secretary'), ($1, $5, 'ministry_leader')`,
        [CHURCH, MEMBER, ADMIN, SECRETARY, LEADER],
      );
      await client.query(`update public.profiles set church_id = $1 where user_id = any($2::uuid[])`, [
        CHURCH,
        [MEMBER, ADMIN, SECRETARY, LEADER],
      ]);
      await client.query(`insert into public.platform_admins (user_id) values ($1)`, [PLATFORM]);
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  async function as(client: PoolClient, userId: string, sql: string, values: unknown[] = []) {
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

  describe("a member's own profile", () => {
    const PROTECTED: Array<[string, string]> = [
      ["role", "'church_admin'"],
      ["church_id", "null"],
      ["user_id", "null"],
      ["membership_status", "'visitor'"],
      ["data_delete_approved_at", "now()"],
      ["is_pastoral", "true"],
      ["safety_clearance_date", "current_date"],
    ];

    it("can't change protected fields: role, church, login, status, approvals, pastoral flag, clearance", async () => {
      await inRolledBackTransaction(async (client) => {
        for (const [column, value] of PROTECTED) {
          const res = await as(client, MEMBER, `update public.profiles set ${column} = ${value} where user_id = $1`, [MEMBER]);
          expect(res.error, column).toMatch(/can't change that on your own profile/);
        }
      });
    });

    it("can still edit their own contact details and data-rights requests", async () => {
      await inRolledBackTransaction(async (client) => {
        const res = await as(
          client,
          MEMBER,
          `update public.profiles set phone = '555-0100', data_export_requested_at = now() where user_id = $1`,
          [MEMBER],
        );
        expect(res.error).toBeNull();
        expect(res.rowCount).toBe(1);
      });
    });

    it("a member can't move themselves into another household (Council Review 27)", async () => {
      await inRolledBackTransaction(async (client) => {
        const family = await client.query<{ id: string }>(
          `insert into public.families (church_id, family_name) values ($1, 'Other Household') returning id`,
          [CHURCH],
        );
        const res = await as(client, MEMBER, `update public.profiles set family_id = $2 where user_id = $1`, [
          MEMBER,
          family.rows[0].id,
        ]);
        expect(res.error).toMatch(/can't change that on your own profile/);
      });
    });

    it("a ministry leader can't set their own safety clearance or deletion approval (owner decision 2026-09-30)", async () => {
      await inRolledBackTransaction(async (client) => {
        for (const sql of [
          `update public.profiles set safety_clearance_date = current_date where user_id = $1`,
          `update public.profiles set data_delete_approved_at = now() where user_id = $1`,
        ]) {
          expect((await as(client, LEADER, sql, [LEADER])).error).toMatch(/can't change that on your own profile/);
        }
      });
    });

    it("a church admin can demote themselves: the membership sync isn't blocked (Council Review 27)", async () => {
      await inRolledBackTransaction(async (client) => {
        const res = await as(
          client,
          ADMIN,
          `update public.church_memberships set role = 'pastor' where user_id = $1 and church_id = $2`,
          [ADMIN, CHURCH],
        );
        expect(res.error).toBeNull();
        expect(res.rowCount).toBe(1);
      });
    });

    it("a church admin can still change a member's role", async () => {
      await inRolledBackTransaction(async (client) => {
        const res = await as(client, ADMIN, `update public.profiles set role = 'ministry_leader' where user_id = $1`, [MEMBER]);
        expect(res.error).toBeNull();
        expect(res.rowCount).toBe(1);
      });
    });
  });

  describe("current_user_role() reads memberships", () => {
    it("ignores profiles.role: a member whose profile says church_admin is still a member", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(`update public.profiles set role = 'church_admin' where user_id = $1`, [MEMBER]);
        expect((await as(client, MEMBER, `select public.current_user_role() as r`)).rows[0].r).toBe("member");
      });
    });

    it("maps membership roles, including secretary, which profiles.role can't express", async () => {
      await inRolledBackTransaction(async (client) => {
        expect((await as(client, ADMIN, `select public.current_user_role() as r`)).rows[0].r).toBe("admin");
        expect((await as(client, SECRETARY, `select public.current_user_role() as r`)).rows[0].r).toBe("manager");
        expect((await as(client, PLATFORM, `select public.current_user_role() as r`)).rows[0].r).toBe("admin");
      });
    });
  });

  describe("/hq is platform staff only", () => {
    it("a church admin sees and writes nothing; a platform admin can", async () => {
      await inRolledBackTransaction(async (client) => {
        const adminRead = await as(client, ADMIN, `select count(*)::int as n from public.hq_tasks`);
        expect(adminRead.rows[0].n).toBe(0);
        const adminWrite = await as(client, ADMIN, `insert into public.hq_tasks (title) values ('church admin task')`);
        expect(adminWrite.error).toMatch(/row-level security/);

        const platformWrite = await as(client, PLATFORM, `insert into public.hq_tasks (title) values ('platform task')`);
        expect(platformWrite.error).toBeNull();
        const platformRead = await as(client, PLATFORM, `select count(*)::int as n from public.hq_tasks where title = 'platform task'`);
        expect(platformRead.rows[0].n).toBe(1);
      });
    });
  });
});
