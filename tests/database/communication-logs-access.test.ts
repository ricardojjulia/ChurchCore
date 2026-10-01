import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// S1 (Council Review 17 F7, Reviews 18 and 28), migration 20261001000000:
// communication_logs, communication_delivery_events and
// communication_suppressions follow the communications pages, which admit
// church admins, pastors and secretaries. Before, a secretary saw nothing and
// a ministry leader (denied by the app) could read every log, recipients'
// contact details and the suppression list. Members read only the messages
// sent to them. No role writes these tables through the API: every writer is
// server-side and uses the church-scoped admin client. Each test is rolled
// back.

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
      await client.query(
        `insert into public.communication_delivery_events
           (church_id, provider, channel, event_type, status, idempotency_key, occurred_at, recipient_contact)
         values ($1, 'resend', 'email', 'delivered', 'delivered', 'cr28-' || $2, now(), 'member@example.test')`,
        [CHURCH, Date.now()],
      );
      await client.query(
        `insert into public.communication_suppressions (church_id, channel, contact, reason)
         values ($1, 'email', 'gone@example.test', 'unsubscribe')`,
        [CHURCH],
      );
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
      return { rows: result.rows, rowCount: result.rowCount, error: null as string | null };
    } catch (error) {
      return { rows: [], rowCount: 0, error: (error as Error).message };
    } finally {
      await client.query("rollback to savepoint as_user");
      await client.query(`reset role`);
    }
  }

  async function visible(client: PoolClient, userId: string, table: string) {
    const res = await as(client, userId, `select count(*)::int as n from public.${table} where church_id = $1`, [CHURCH]);
    return res.rows[0].n as number;
  }

  const visibleLogs = (client: PoolClient, userId: string) => visible(client, userId, "communication_logs");

  async function canInsert(client: PoolClient, userId: string, sql: string) {
    return (await as(client, userId, sql, [CHURCH])).error === null;
  }

  const INSERTS = {
    communication_logs: `insert into public.communication_logs (church_id, channel, subject, status) values ($1, 'email', 'x', 'sent')`,
    communication_delivery_events: `insert into public.communication_delivery_events
      (church_id, provider, channel, event_type, status, idempotency_key, occurred_at)
      values ($1, 'resend', 'email', 'sent', 'sent', 'cr28-insert-' || gen_random_uuid(), now())`,
    communication_suppressions: `insert into public.communication_suppressions (church_id, channel, contact, reason)
      values ($1, 'email', 'new-' || gen_random_uuid() || '@example.test', 'manual')`,
  } as const;

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

  describe("delivery events and the suppression list (Council Review 28)", () => {
    for (const table of ["communication_delivery_events", "communication_suppressions"]) {
      it(`${table}: church admins, pastors and secretaries read it; ministry leaders and members don't`, async () => {
        await inRolledBackTransaction(async (client) => {
          expect(await visible(client, USERS.church_admin, table)).toBe(1);
          expect(await visible(client, USERS.pastor, table)).toBe(1);
          expect(await visible(client, USERS.secretary, table)).toBe(1);
          expect(await visible(client, USERS.ministry_leader, table)).toBe(0);
          expect(await visible(client, USERS.member, table)).toBe(0);
        });
      });
    }
  });

  describe("nobody inserts directly: every writer is server-side (Council Review 28, PR #165 review)", () => {
    for (const [table, sql] of Object.entries(INSERTS)) {
      it(`${table}: no role can insert through the API`, async () => {
        await inRolledBackTransaction(async (client) => {
          for (const userId of Object.values(USERS)) {
            expect(await canInsert(client, userId, sql), userId).toBe(false);
          }
        });
      });
    }
  });

  it("nobody updates a log directly, so cancelling goes through the scoped admin client (Council Review 28)", async () => {
    await inRolledBackTransaction(async (client) => {
      const res = await as(
        client,
        USERS.church_admin,
        `update public.communication_logs set status = 'cancelled' where church_id = $1`,
        [CHURCH],
      );
      expect(res.error).toBeNull();
      expect(res.rowCount).toBe(0);
    });
  });
});
