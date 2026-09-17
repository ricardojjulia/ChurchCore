import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

describe("current_user_role RLS helper function", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  const runTestInTransaction = async (
    testFn: (client: PoolClient) => Promise<void>
  ) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  it("returns 'member' for unauthenticated or non-profile users", async () => {
    await runTestInTransaction(async (client) => {
      const testUserId = "00000000-0000-0000-0000-000000000000";
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [testUserId]);

      const res = await client.query("SELECT public.current_user_role() as role");
      expect(res.rows[0].role).toBe("member");
    });
  });

  it("returns 'admin' if the user is a platform admin", async () => {
    await runTestInTransaction(async (client) => {
      const testUserId = "11111111-1111-1111-1111-111111111111";

      await client.query(
        "INSERT INTO auth.users (id, email) VALUES ($1, $2)",
        [testUserId, `admin-test-${Date.now()}@example.com`]
      );

      await client.query(
        "INSERT INTO public.platform_admins (user_id) VALUES ($1)",
        [testUserId]
      );

      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [testUserId]);

      const res = await client.query("SELECT public.current_user_role() as role");
      expect(res.rows[0].role).toBe("admin");
    });
  });

  it("returns 'admin' if user profile role is 'church_admin'", async () => {
    await runTestInTransaction(async (client) => {
      const testUserId = "22222222-2222-2222-2222-222222222222";
      const churchId = "00000000-0000-0000-0000-000000000001";
      const testEmail = `church-admin-test-${Date.now()}@example.com`;

      // Insert mock church
      await client.query(
        `INSERT INTO public.churches (id, name, slug) 
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [churchId, "Test Church", `test-church-slug-${Date.now()}`]
      );

      // Trigger creates profile for testUserId
      await client.query(
        "INSERT INTO auth.users (id, email) VALUES ($1, $2)",
        [testUserId, testEmail]
      );

      // Update the profile auto-created by the trigger (use 'church_admin')
      await client.query(
        `UPDATE public.profiles 
         SET full_name = $2, role = $3, church_id = $4
         WHERE user_id = $1`,
        [testUserId, "Admin Tester", "church_admin", churchId]
      );

      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [testUserId]);

      const res = await client.query("SELECT public.current_user_role() as role");
      expect(res.rows[0].role).toBe("admin");
    });
  });

  it("returns 'manager' if user profile role is in pastor/secretary/ministry_leader list", async () => {
    await runTestInTransaction(async (client) => {
      const testUserId = "33333333-3333-3333-3333-333333333333";
      const churchId = "00000000-0000-0000-0000-000000000001";
      const testEmail = `pastor-test-${Date.now()}@example.com`;

      await client.query(
        `INSERT INTO public.churches (id, name, slug) 
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [churchId, "Test Church", `test-church-slug-${Date.now()}`]
      );

      await client.query(
        "INSERT INTO auth.users (id, email) VALUES ($1, $2)",
        [testUserId, testEmail]
      );

      await client.query(
        `UPDATE public.profiles 
         SET full_name = $2, role = $3, church_id = $4
         WHERE user_id = $1`,
        [testUserId, "Pastor Tester", "pastor_elder", churchId]
      );

      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [testUserId]);

      const res = await client.query("SELECT public.current_user_role() as role");
      expect(res.rows[0].role).toBe("manager");
    });
  });

  it("returns 'teacher' if profile role is 'member_volunteer' and has a 'lead_teacher' volunteer assignment", async () => {
    await runTestInTransaction(async (client) => {
      const testUserId = "44444444-4444-4444-4444-444444444444";
      const churchId = "00000000-0000-0000-0000-000000000001";
      const ministryId = "00000000-0000-0000-0000-000000000002";
      const testEmail = `teacher-test-${Date.now()}@example.com`;

      await client.query(
        `INSERT INTO public.churches (id, name, slug) 
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [churchId, "Test Church", `test-church-slug-${Date.now()}`]
      );

      await client.query(
        `INSERT INTO public.ministries (id, church_id, name, slug) 
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [ministryId, churchId, "Test Kids Ministry", `kids-slug-${Date.now()}`]
      );

      const serviceRes = await client.query(
        `INSERT INTO public.ccm_services (church_id, ministry_id, service_name) 
         VALUES ($1, $2, $3) RETURNING id`,
        [churchId, ministryId, "Sunday Test Service"]
      );
      const serviceId = serviceRes.rows[0]?.id;

      const roomRes = await client.query(
        `INSERT INTO public.children_rooms (church_id, ministry_id, name) 
         VALUES ($1, $2, $3) RETURNING id`,
        [churchId, ministryId, "Test Room"]
      );
      const roomId = roomRes.rows[0]?.id;

      await client.query(
        "INSERT INTO auth.users (id, email) VALUES ($1, $2)",
        [testUserId, testEmail]
      );

      // Fetch the auto-created profile ID
      const profileRes = await client.query(
        "SELECT id FROM public.profiles WHERE user_id = $1",
        [testUserId]
      );
      const profileId = profileRes.rows[0]?.id;

      await client.query(
        `UPDATE public.profiles 
         SET full_name = $2, role = $3, church_id = $4
         WHERE id = $1`,
        [profileId, "Teacher Tester", "member_volunteer", churchId]
      );

      await client.query(
        `INSERT INTO public.ccm_volunteer_assignments (church_id, service_id, room_id, profile_id, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [churchId, serviceId, roomId, profileId, "lead_teacher"]
      );

      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [testUserId]);

      const res = await client.query("SELECT public.current_user_role() as role");
      expect(res.rows[0].role).toBe("teacher");
    });
  });
});
