import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// S1 (Council Review 17 F7, Review 18), migration 20261001000000:
// communication_logs access matches the communications pages, which admit
// church admins, pastors and secretaries. Before, a secretary saw nothing and
// a ministry leader (denied by the app) could read every log. Members read
// only the messages sent to them. Each test is rolled back.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH = "00000000-0000-0000-0000-0000000000f7";
const USERS = {
  church_admin: "00000000-0000-0000-0000-00000000f701",
  pastor: "00000000-0000-0000-0000-00000000f702",
  secretary: "00000000-0000-0000-0000-00000000f703",
  ministry_leader: "00000000-0000-0000-0000-00000000f704",
  member: "00000000-0000-0000-0000-00000000f705",
} as const;

describe("communication_logs access by role (S1)", () => {
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
      await client.query(`insert into public.churches (id, name, slug) values ($1, 'Comms Church', 'comms-church-' || $2)`, [
        CHURCH,
        Date.now(),
      ]);
      for (const [role, id] of Object.entries(USERS)) {
        await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `comms-${role}@example.test`]);
        await client.query(`insert into public.church_memberships (church_id, user_id, role) values ($1, $2, $3)`, [
          CHURCH,
          id,
          role,
        ]);
      }
      await client.query(`update public.profiles set church_id = $1 where user_id = any($2::uuid[])`, [
        CHURCH,
        Object.values(USERS),
      ]);
      const member = await client.query<{ id: string }>(`select id from public.profiles where user_id = $1`, [USERS.member]);
      // One message to the member, one to nobody in particular.
      await client.query(
        `insert into public.communication_logs (church_id, recipient_id, channel, subject, status) values
           ($1, $2, 'email', 'To the member', 'sent'),
           ($1, null, 'email', 'Broadcast', 'sent')`,
        [CHURCH, member.rows[0].id],
      );
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  async function visibleLogs(client: PoolClient, userId: string) {
    await client.query("savepoint as_user");
    await client.query(`set local role authenticated`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    try {
      const res = await client.query<{ n: number }>(
        `select count(*)::int as n from public.communication_logs where church_id = $1`,
        [CHURCH],
      );
      return res.rows[0].n;
    } finally {
      await client.query("rollback to savepoint as_user");
      await client.query(`reset role`);
    }
  }

  it("church admins, pastors and secretaries read the church's logs, as their pages show", async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await visibleLogs(client, USERS.church_admin)).toBe(2);
      expect(await visibleLogs(client, USERS.pastor)).toBe(2);
      expect(await visibleLogs(client, USERS.secretary)).toBe(2);
    });
  });

  it("a ministry leader, whom the communications pages deny, reads none", async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await visibleLogs(client, USERS.ministry_leader)).toBe(0);
    });
  });

  it("a member reads only the messages sent to them", async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await visibleLogs(client, USERS.member)).toBe(1);
    });
  });
});
