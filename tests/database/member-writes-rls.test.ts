import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// S8 (member writes vs. RLS), run as the `authenticated` role with a real
// member's JWT claims so the policies actually apply.
//
// 1. Member writes that carry business rules (giving, check-in, group join,
//    registration payments) stay closed to direct writes: the app performs
//    them server-side after its checks (ADR 0022). These tests prove a member
//    can't skip those checks by writing to the tables directly.
// 2. event_rsvps: the self policy compared a profile id with auth.uid(), so
//    every member RSVP was rejected
//    (supabase/migrations/20260929000000_event_rsvps_own_profile_policy.sql).
//    A member now RSVPs only as themselves, only to an RSVP-enabled event in
//    their own church.
// Each test runs in a rolled-back transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH_A = "00000000-0000-0000-0000-0000000000a8";
const CHURCH_B = "00000000-0000-0000-0000-0000000000b8";
const MEMBER_USER = "00000000-0000-0000-0000-00000000f001";
const OTHER_MEMBER_PROFILE = "00000000-0000-0000-0000-00000000f002";
const EVENT_RSVP = "00000000-0000-0000-0000-00000000f101";
const EVENT_NO_RSVP = "00000000-0000-0000-0000-00000000f102";
const EVENT_OTHER_CHURCH = "00000000-0000-0000-0000-00000000f103";
const GROUP = "00000000-0000-0000-0000-00000000f201";

describe("member writes under RLS (S8)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  const inRolledBackTransaction = async (testFn: (client: PoolClient, memberProfileId: string) => Promise<void>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `insert into public.churches (id, name, slug) values
           ($1, 'Writes A', 'writes-a-' || $3), ($2, 'Writes B', 'writes-b-' || $3)
         on conflict (id) do nothing`,
        [CHURCH_A, CHURCH_B, Date.now()],
      );
      await client.query(`insert into auth.users (id, email) values ($1, 'writes-member@example.test')`, [MEMBER_USER]);
      await client.query(`insert into public.church_memberships (church_id, user_id, role) values ($1, $2, 'member')`, [
        CHURCH_A,
        MEMBER_USER,
      ]);
      await client.query(`update public.profiles set church_id = $1 where user_id = $2`, [CHURCH_A, MEMBER_USER]);
      await client.query(`insert into public.profiles (id, church_id, full_name) values ($1, $2, 'Other Member')`, [
        OTHER_MEMBER_PROFILE,
        CHURCH_A,
      ]);
      await client.query(
        `insert into public.events (id, church_id, title, starts_at, ends_at, category, rsvp_enabled) values
           ($1, $4, 'Potluck', now() + interval '3 days', now() + interval '3 days 2 hours', 'general', true),
           ($2, $4, 'No RSVP', now() + interval '3 days', now() + interval '3 days 2 hours', 'general', false),
           ($3, $5, 'Other church', now() + interval '3 days', now() + interval '3 days 2 hours', 'general', true)`,
        [EVENT_RSVP, EVENT_NO_RSVP, EVENT_OTHER_CHURCH, CHURCH_A, CHURCH_B],
      );
      await client.query(`insert into public.groups (id, church_id, name) values ($1, $2, 'Writes Group')`, [GROUP, CHURCH_A]);
      const profile = await client.query<{ id: string }>(`select id from public.profiles where user_id = $1`, [MEMBER_USER]);
      await testFn(client, profile.rows[0].id);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  /** Runs `sql` as the member (RLS applies), inside a savepoint so a denial doesn't abort the transaction. */
  async function asMember(client: PoolClient, sql: string, values: unknown[]) {
    await client.query("savepoint as_member");
    await client.query(`set local role authenticated`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: MEMBER_USER, role: "authenticated" }),
    ]);
    try {
      const result = await client.query(sql, values);
      await client.query("release savepoint as_member");
      return { rowCount: result.rowCount, error: null as string | null };
    } catch (error) {
      await client.query("rollback to savepoint as_member");
      return { rowCount: 0, error: (error as Error).message };
    } finally {
      await client.query(`reset role`);
    }
  }

  describe("writes with business rules stay server-side", () => {
    it("a member can't insert a donation directly (e.g. one already marked succeeded)", async () => {
      await inRolledBackTransaction(async (client, me) => {
        const res = await asMember(
          client,
          `insert into public.donations (church_id, profile_id, amount_cents, status) values ($1, $2, 100, 'succeeded')`,
          [CHURCH_A, me],
        );
        expect(res.error).toMatch(/row-level security/);
      });
    });

    it("a member can't mark attendance directly (skipping the check-in window, code and location)", async () => {
      await inRolledBackTransaction(async (client, me) => {
        const res = await asMember(
          client,
          `insert into public.attendance (church_id, event_id, profile_id, status) values ($1, $2, $3, 'present')`,
          [CHURCH_A, EVENT_RSVP, me],
        );
        expect(res.error).toMatch(/row-level security/);
      });
    });

    it("a member can't add themselves to a group directly (skipping the open/active check)", async () => {
      await inRolledBackTransaction(async (client, me) => {
        const res = await asMember(
          client,
          `insert into public.group_members (group_id, church_id, profile_id, role, status) values ($1, $2, $3, 'member', 'active')`,
          [GROUP, CHURCH_A, me],
        );
        expect(res.error).toMatch(/row-level security/);
      });
    });
  });

  describe("event RSVPs", () => {
    const RSVP = `insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'yes')`;

    it("a member RSVPs as themselves to an RSVP-enabled event in their church, and can change it", async () => {
      await inRolledBackTransaction(async (client, me) => {
        expect((await asMember(client, RSVP, [EVENT_RSVP, me])).error).toBeNull();
        const updated = await asMember(
          client,
          `update public.event_rsvps set status = 'no' where event_id = $1 and user_id = $2`,
          [EVENT_RSVP, me],
        );
        expect(updated.rowCount).toBe(1);
      });
    });

    it("a member can't RSVP as someone else, to an event without RSVPs, or to another church's event", async () => {
      await inRolledBackTransaction(async (client, me) => {
        expect((await asMember(client, RSVP, [EVENT_RSVP, OTHER_MEMBER_PROFILE])).error).toMatch(/row-level security/);
        expect((await asMember(client, RSVP, [EVENT_NO_RSVP, me])).error).toMatch(/row-level security/);
        expect((await asMember(client, RSVP, [EVENT_OTHER_CHURCH, me])).error).toMatch(/row-level security/);
      });
    });
  });
});
