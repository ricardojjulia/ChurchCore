import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

describe("consent_logs immutability trigger", () => {
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

  it("fails to update any existing consent log entry", async () => {
    await runTestInTransaction(async (client) => {
      const churchId = "00000000-0000-0000-0000-000000000001";
      const profileId = "00000000-0000-0000-0000-000000000002";

      // Seed a church and profile first to satisfy foreign key constraints
      await client.query(
        `INSERT INTO public.churches (id, name, slug) 
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [churchId, "Test Church", "test-church-consent"]
      );

      // Create an auth user to trigger profile creation
      await client.query(
        "INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        [profileId, "consent-test@example.com"]
      );

      // Update auto-created profile with correct church
      await client.query(
        "UPDATE public.profiles SET church_id = $2 WHERE user_id = $1",
        [profileId, churchId]
      );

      // Fetch the actual profiles.id primary key
      const profileRes = await client.query(
        "SELECT id FROM public.profiles WHERE user_id = $1",
        [profileId]
      );
      const actualProfileId = profileRes.rows[0].id;

      // Insert consent log
      const insertRes = await client.query(
        `INSERT INTO public.consent_logs (church_id, profile_id, consent_type, consented, communication_type)
         VALUES ($1, $2, 'directory_visibility', true, null) RETURNING id`,
        [churchId, actualProfileId]
      );
      const consentLogId = insertRes.rows[0].id;

      // Try updating consent log - should fail due to trigger
      await expect(
        client.query(
          "UPDATE public.consent_logs SET consented = false WHERE id = $1",
          [consentLogId]
        )
      ).rejects.toThrow("Modification or deletion of consent log entries is prohibited");
    });
  });

  it("fails to delete any existing consent log entry", async () => {
    await runTestInTransaction(async (client) => {
      const churchId = "00000000-0000-0000-0000-000000000001";
      const profileId = "00000000-0000-0000-0000-000000000002";

      await client.query(
        `INSERT INTO public.churches (id, name, slug) 
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [churchId, "Test Church", "test-church-consent"]
      );

      await client.query(
        "INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        [profileId, "consent-test@example.com"]
      );

      await client.query(
        "UPDATE public.profiles SET church_id = $2 WHERE user_id = $1",
        [profileId, churchId]
      );

      const profileRes = await client.query(
        "SELECT id FROM public.profiles WHERE user_id = $1",
        [profileId]
      );
      const actualProfileId = profileRes.rows[0].id;

      const insertRes = await client.query(
        `INSERT INTO public.consent_logs (church_id, profile_id, consent_type, consented, communication_type)
         VALUES ($1, $2, 'directory_visibility', true, null) RETURNING id`,
        [churchId, actualProfileId]
      );
      const consentLogId = insertRes.rows[0].id;

      // Try deleting consent log - should fail due to trigger
      await expect(
        client.query("DELETE FROM public.consent_logs WHERE id = $1", [consentLogId])
      ).rejects.toThrow("Modification or deletion of consent log entries is prohibited");
    });
  });
});
