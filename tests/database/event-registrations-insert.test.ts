import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// S10 (Council Review 22), migration 20261002000000: nobody inserts into
// event_registrations through the public API. The dropped
// event_registrations_public_insert (`with check (true)`) let anyone with the
// anon key insert a confirmed, paid registration for any church. Visitors and
// members register through server actions; staff keep their manage policy.
// Each test is rolled back.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH = "00000000-0000-0000-0000-0000000000a1";
const EVENT = "00000000-0000-0000-0000-0000000000a2";
const MEMBER = "00000000-0000-0000-0000-0000000000a3";
const ADMIN = "00000000-0000-0000-0000-0000000000a4";

describe("event_registrations: no public inserts (S10)", () => {
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
      await client.query(`insert into public.churches (id, name, slug) values ($1, 'Reg Church', 'reg-church-' || $2)`, [
        CHURCH,
        Date.now(),
      ]);
      await client.query(
        `insert into public.events (id, church_id, title, starts_at, ends_at, visibility, category)
         values ($1, $2, 'Open House', now() + interval '7 days', now() + interval '7 days 2 hours', 'public', 'outreach')`,
        [EVENT, CHURCH],
      );
      for (const [id, role] of [
        [MEMBER, "member"],
        [ADMIN, "church_admin"],
      ]) {
        await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `reg-${role}@example.test`]);
        await client.query(`insert into public.church_memberships (church_id, user_id, role) values ($1, $2, $3)`, [
          CHURCH,
          id,
          role,
        ]);
      }
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  async function tryInsert(client: PoolClient, role: "anon" | "authenticated", userId?: string) {
    await client.query("savepoint attempt");
    try {
      await client.query(`set local role ${role}`);
      if (userId) {
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: userId, role: "authenticated" }),
        ]);
      }
      await client.query(
        `insert into public.event_registrations
           (event_id, church_id, registrant_name, registrant_email, status, payment_status)
         values ($1, $2, 'Forged', 'forged@example.test', 'confirmed', 'paid')`,
        [EVENT, CHURCH],
      );
      return null;
    } catch (error) {
      return (error as Error).message;
    } finally {
      await client.query("rollback to savepoint attempt");
      await client.query("reset role");
    }
  }

  it("the anon key can't insert a registration (a confirmed, paid one least of all)", async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await tryInsert(client, "anon")).toMatch(/row-level security/);
    });
  });

  it("a signed-in member can't insert one directly either", async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await tryInsert(client, "authenticated", MEMBER)).toMatch(/row-level security/);
    });
  });

  it("a church admin still can (event_registrations_manage)", async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await tryInsert(client, "authenticated", ADMIN)).toBeNull();
    });
  });
});
