import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// G4.1: member numbers are unique per church, not platform-wide. Migration
// 20261008000000 dropped the global profiles_member_number_uidx so a second
// church can import an export whose ids collide with the first church's.
// Each test runs in a rolled-back transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH_A = "00000000-0000-0000-0000-0000000000a4";
const CHURCH_B = "00000000-0000-0000-0000-0000000000b4";

describe("profiles.member_number uniqueness (G4.1)", () => {
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
      await client.query(
        `insert into public.churches (id, name, slug) values
           ($1, 'Numbers A', 'numbers-a-' || $3), ($2, 'Numbers B', 'numbers-b-' || $3)
         on conflict (id) do nothing`,
        [CHURCH_A, CHURCH_B, Date.now()],
      );
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  const insertProfile = (client: PoolClient, churchId: string, name: string, memberNumber: string) =>
    client.query(
      `insert into public.profiles (church_id, full_name, member_number) values ($1, $2, $3)`,
      [churchId, name, memberNumber],
    );

  it("no longer has the platform-wide unique index", async () => {
    const result = await pool.query(
      `select indexname from pg_indexes
       where schemaname = 'public' and indexname in ('profiles_member_number_uidx', 'profiles_member_number_church_uidx')`,
    );
    const names = result.rows.map((row) => row.indexname);
    expect(names).not.toContain("profiles_member_number_uidx");
    expect(names).toContain("profiles_member_number_church_uidx");
  });

  it("lets two churches use the same member number", async () => {
    await inRolledBackTransaction(async (client) => {
      await insertProfile(client, CHURCH_A, "Person A", "12345");
      await expect(insertProfile(client, CHURCH_B, "Person B", "12345")).resolves.toBeDefined();
    });
  });

  it("still rejects a duplicate member number inside one church", async () => {
    await inRolledBackTransaction(async (client) => {
      await insertProfile(client, CHURCH_A, "Person A", "12345");
      await expect(insertProfile(client, CHURCH_A, "Person A2", "12345")).rejects.toMatchObject({
        code: "23505",
      });
    });
  });
});
