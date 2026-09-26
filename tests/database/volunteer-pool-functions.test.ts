import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// Real-Postgres coverage for the rotation planner's SQL functions
// (supabase/migrations/20260926000000_service_plan_rotation_planner.sql):
// get_volunteer_pool() and get_volunteer_directory(). The mocked tests in
// lib/volunteer-data.test.ts only check the RPC call and row mapping; this
// file checks the counting windows, declined-shift exclusion, merged-profile
// exclusion and church scoping against the real query, and — running as the
// `authenticated` role with JWT claims, so RLS actually applies — that
// church admins and ministry leaders get the same complete data while
// another church's admin gets nothing. Each test runs in a rolled-back
// transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH_A = "00000000-0000-0000-0000-0000000000a3";
const CHURCH_B = "00000000-0000-0000-0000-0000000000b3";
const ANN = "00000000-0000-0000-0000-00000000a001";
const BEN = "00000000-0000-0000-0000-00000000a002";
const CAT_MERGED = "00000000-0000-0000-0000-00000000a003";
const EVE = "00000000-0000-0000-0000-00000000a005";
const FAY = "00000000-0000-0000-0000-00000000a006";
const DAN_OTHER_CHURCH = "00000000-0000-0000-0000-00000000b001";
const ROLE = "00000000-0000-0000-0000-00000000c001";
const PLAN = "00000000-0000-0000-0000-00000000c002";
const POSITION = "00000000-0000-0000-0000-00000000c003";
const EVENT_A = "00000000-0000-0000-0000-00000000c004";
const EVENT_B = "00000000-0000-0000-0000-00000000c005";
// Auth users for the RLS tests.
const ADMIN_A_USER = "00000000-0000-0000-0000-00000000d001";
const LEADER_A_USER = "00000000-0000-0000-0000-00000000d002";
const ADMIN_B_USER = "00000000-0000-0000-0000-00000000d003";

// The service date under test. 2026-03-15 is in the past, so every shift
// below also counts for the directory's "last served" (starts_at <= now()).
const SERVICE_DATE = "2026-03-15";

async function seed(client: PoolClient) {
  await client.query(
    `insert into public.churches (id, name, slug) values
       ($1, 'Pool Test A', 'pool-test-a-' || $3), ($2, 'Pool Test B', 'pool-test-b-' || $3)
     on conflict (id) do nothing`,
    [CHURCH_A, CHURCH_B, Date.now()],
  );
  await client.query(
    `insert into public.profiles (id, church_id, full_name) values
       ($1, $7, 'Ann'), ($2, $7, 'Ben'), ($3, $7, 'Cat'), ($4, $7, 'Eve'), ($5, $7, 'Fay'), ($6, $8, 'Dan')`,
    [ANN, BEN, CAT_MERGED, EVE, FAY, DAN_OTHER_CHURCH, CHURCH_A, CHURCH_B],
  );
  await client.query(`update public.profiles set merged_into_profile_id = $1 where id = $2`, [ANN, CAT_MERGED]);
  await client.query(
    `insert into public.volunteer_profiles (church_id, user_id, skills, max_services_per_month) values
       ($1, $2, '{vocals}', 2), ($1, $3, '{}', null), ($4, $5, '{audio}', null)`,
    [CHURCH_A, ANN, CAT_MERGED, CHURCH_B, DAN_OTHER_CHURCH],
  );
  await client.query(
    `insert into public.events (id, church_id, title, starts_at, ends_at, category) values
       ($1, $3, 'Sunday', '2026-03-15 10:00+00', '2026-03-15 12:00+00', 'worship'),
       ($2, $4, 'Sunday', '2026-03-15 10:00+00', '2026-03-15 12:00+00', 'worship')`,
    [EVENT_A, EVENT_B, CHURCH_A, CHURCH_B],
  );
  await client.query(`insert into public.service_plan_role_types (id, church_id, name) values ($1, $2, 'Worship Leader')`, [ROLE, CHURCH_A]);
  await client.query(`insert into public.service_plans (id, church_id, name, service_date) values ($1, $2, 'Past', '2026-03-05')`, [PLAN, CHURCH_A]);
  await client.query(
    `insert into public.service_plan_positions (id, plan_id, church_id, role_type_id) values ($1, $2, $3, $4)`,
    [POSITION, PLAN, CHURCH_A, ROLE],
  );

  const shift = (who: string, at: string, status: string, positionId: string | null = null, church = CHURCH_A, event = EVENT_A) =>
    client.query(
      `insert into public.volunteer_shifts
         (church_id, event_id, position_id, assigned_user_id, title, starts_at, ends_at, confirmation_status)
       values ($1, $2, $3, $4, 'Shift', $5::timestamptz, $5::timestamptz + interval '2 hours', $6)`,
      [church, event, positionId, who, at, status],
    );
  // Ann: two counted shifts in the 30-day window (one in the role), one declined.
  await shift(ANN, "2026-03-10 10:00+00", "pending");
  await shift(ANN, "2026-03-05 10:00+00", "confirmed", POSITION);
  await shift(ANN, "2026-02-23 10:00+00", "declined");
  // Ben: blocked and already serving on the service date; an older shift outside the window.
  await shift(BEN, "2026-03-15 08:00+00", "pending");
  await shift(BEN, "2026-02-01 10:00+00", "confirmed");
  await client.query(
    `insert into public.volunteer_blocked_dates (church_id, profile_id, blocked_date) values ($1, $2, $3)`,
    [CHURCH_A, BEN, SERVICE_DATE],
  );
  await client.query(
    `insert into public.volunteer_hours_log (church_id, profile_id, service_date, hours) values ($1, $2, '2026-02-01', 3.5)`,
    [CHURCH_A, BEN],
  );
  // Eve: only a declined shift on the service date — not "serving".
  await shift(EVE, "2026-03-15 10:00+00", "declined");
  // Dan (another church) is serving that day; must never leak into church A.
  await shift(DAN_OTHER_CHURCH, "2026-03-15 10:00+00", "confirmed", null, CHURCH_B, EVENT_B);

  await client.query(
    `insert into auth.users (id, email) values
       ($1, 'pool-admin-a@example.test'), ($2, 'pool-leader-a@example.test'), ($3, 'pool-admin-b@example.test')`,
    [ADMIN_A_USER, LEADER_A_USER, ADMIN_B_USER],
  );
  await client.query(
    `insert into public.church_memberships (church_id, user_id, role) values
       ($1, $3, 'church_admin'), ($1, $4, 'ministry_leader'), ($2, $5, 'church_admin')`,
    [CHURCH_A, CHURCH_B, ADMIN_A_USER, LEADER_A_USER, ADMIN_B_USER],
  );
}

/** Runs `sql` as an authenticated user, so RLS applies, then returns to the superuser role. */
async function asUser(client: PoolClient, userId: string, sql: string, values: unknown[]) {
  await client.query(`set local role authenticated`);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    return await client.query(sql, values);
  } finally {
    await client.query(`reset role`);
  }
}

describe("rotation planner SQL functions", () => {
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
      await seed(client);
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  it("both functions are SECURITY INVOKER, so the caller's RLS applies", async () => {
    const res = await pool.query(
      `select proname, prosecdef from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('get_volunteer_pool', 'get_volunteer_directory')
       order by proname`,
    );
    expect(res.rows).toEqual([
      { proname: "get_volunteer_directory", prosecdef: false },
      { proname: "get_volunteer_pool", prosecdef: false },
    ]);
  });

  describe("get_volunteer_pool", () => {
    it("returns every non-merged profile in the church, and nobody from another church", async () => {
      await inRolledBackTransaction(async (client) => {
        const res = await client.query(`select profile_id, full_name from public.get_volunteer_pool($1, $2)`, [CHURCH_A, SERVICE_DATE]);
        const ids = res.rows.map((r) => r.profile_id);
        // (The RLS tests' auth users also get church A profiles, via the
        // on_auth_user_created trigger, so assert membership, not the exact list.)
        expect(ids).toEqual(expect.arrayContaining([ANN, BEN, EVE, FAY]));
        expect(ids).not.toContain(CAT_MERGED);
        expect(ids).not.toContain(DAN_OTHER_CHURCH);
      });
    });

    it("counts load, month, last-served and role history from non-declined shifts only", async () => {
      await inRolledBackTransaction(async (client) => {
        const res = await client.query(
          `select * from public.get_volunteer_pool($1, $2, $3) where full_name in ('Ann', 'Ben', 'Eve')`,
          [CHURCH_A, SERVICE_DATE, ROLE],
        );
        const byName = Object.fromEntries(res.rows.map((r) => [r.full_name, r]));

        expect(byName.Ann).toMatchObject({
          skills: ["vocals"],
          max_services_per_month: 2,
          is_blocked: false,
          serving_on_date: false,
          recent_shift_count: 2,
          month_shift_count: 2,
          role_served_count: 1,
        });
        expect(new Date(byName.Ann.last_served_at).toISOString()).toBe("2026-03-10T10:00:00.000Z");

        // Ben's shift on the service date counts toward his load and month,
        // but "last served" only looks before the date.
        expect(byName.Ben).toMatchObject({
          is_blocked: true,
          serving_on_date: true,
          recent_shift_count: 1,
          month_shift_count: 1,
          role_served_count: 0,
        });
        expect(new Date(byName.Ben.last_served_at).toISOString()).toBe("2026-02-01T10:00:00.000Z");
        expect(Number(byName.Ben.total_hours)).toBe(3.5);

        // A declined shift on the date doesn't make Eve "serving" or add load,
        // but being scheduled at all makes her a known volunteer.
        expect(byName.Eve).toMatchObject({ serving_on_date: false, recent_shift_count: 0, last_served_at: null, is_volunteer: true });
        // Ann has a volunteer profile; Ben has only shifts.
        expect(byName.Ann.is_volunteer).toBe(true);
        expect(byName.Ben.is_volunteer).toBe(true);
      });
    });

    it("reports zero role history when no role type is given", async () => {
      await inRolledBackTransaction(async (client) => {
        const res = await client.query(
          `select role_served_count from public.get_volunteer_pool($1, $2) where full_name = 'Ann'`,
          [CHURCH_A, SERVICE_DATE],
        );
        expect(res.rows[0].role_served_count).toBe(0);
      });
    });
  });

  it("is_volunteer is false for someone with no volunteer profile and no shifts", async () => {
    await inRolledBackTransaction(async (client) => {
      const res = await client.query(
        `select is_volunteer from public.get_volunteer_pool($1, $2) where full_name = 'Fay'`,
        [CHURCH_A, SERVICE_DATE],
      );
      expect(res.rows[0].is_volunteer).toBe(false);
    });
  });

  describe("under RLS (as the authenticated role)", () => {
    const POOL_SQL = `select full_name, recent_shift_count, month_shift_count, is_blocked, serving_on_date, total_hours
                      from public.get_volunteer_pool($1, $2, $3) order by full_name`;

    it("a church admin and a ministry leader get the same complete pool", async () => {
      await inRolledBackTransaction(async (client) => {
        const asSuperuser = await client.query(POOL_SQL, [CHURCH_A, SERVICE_DATE, ROLE]);
        const asAdmin = await asUser(client, ADMIN_A_USER, POOL_SQL, [CHURCH_A, SERVICE_DATE, ROLE]);
        const asLeader = await asUser(client, LEADER_A_USER, POOL_SQL, [CHURCH_A, SERVICE_DATE, ROLE]);

        expect(asAdmin.rows).toEqual(asSuperuser.rows);
        expect(asLeader.rows).toEqual(asSuperuser.rows);
        // Sanity: the counts are real, not all zero.
        expect(asAdmin.rows.find((r) => r.full_name === "Ben")).toMatchObject({ is_blocked: true, serving_on_date: true });
      });
    });

    it("another church's admin gets nothing from either function", async () => {
      await inRolledBackTransaction(async (client) => {
        const pool = await asUser(client, ADMIN_B_USER, POOL_SQL, [CHURCH_A, SERVICE_DATE, ROLE]);
        const directory = await asUser(client, ADMIN_B_USER, `select * from public.get_volunteer_directory($1, 2026)`, [CHURCH_A]);
        expect(pool.rows).toEqual([]);
        expect(directory.rows).toEqual([]);
      });
    });

    it("anon cannot execute either function", async () => {
      const res = await pool.query(
        `select has_function_privilege('anon', 'public.get_volunteer_pool(uuid, date, uuid)', 'execute') as pool,
                has_function_privilege('anon', 'public.get_volunteer_directory(uuid, integer)', 'execute') as directory,
                has_function_privilege('authenticated', 'public.get_volunteer_pool(uuid, date, uuid)', 'execute') as pool_auth`,
      );
      expect(res.rows[0]).toEqual({ pool: false, directory: false, pool_auth: true });
    });
  });

  describe("get_volunteer_directory", () => {
    it("lists people with a volunteer profile or any shift, scoped to the church", async () => {
      await inRolledBackTransaction(async (client) => {
        const res = await client.query(`select * from public.get_volunteer_directory($1, 2026)`, [CHURCH_A]);
        // Fay has neither a volunteer profile nor a shift; Cat is merged; Dan is another church.
        expect(res.rows.map((r) => r.full_name)).toEqual(["Ann", "Ben", "Eve"]);

        const byName = Object.fromEntries(res.rows.map((r) => [r.full_name, r]));
        // Only confirmed shifts count as "served this year".
        expect(byName.Ann.shifts_this_year).toBe(1);
        expect(byName.Ann.max_services_per_month).toBe(2);
        expect(new Date(byName.Ann.last_served_date).toISOString()).toBe("2026-03-10T10:00:00.000Z");
        expect(Number(byName.Ben.total_hours)).toBe(3.5);
        expect(byName.Eve.last_served_date).toBeNull();
      });
    });
  });
});
