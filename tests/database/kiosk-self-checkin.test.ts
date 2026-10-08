import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// G2.2 (migration 20261010000000): kiosk self check-in data. Family check-in
// codes are unreadable through the user-scoped client, unique per church, and
// shaped; kiosk tables are admin-readable and server-written; and a child can be
// actively checked in once per service. Each test runs in a rolled-back transaction.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH_A = "00000000-0000-0000-0000-0000000000a7";
const CHURCH_B = "00000000-0000-0000-0000-0000000000b7";
const ADMIN_A = "00000000-0000-0000-0000-00000000a701";
const ADMIN_B = "00000000-0000-0000-0000-00000000a702";
const PASTOR_A = "00000000-0000-0000-0000-00000000a703";
const MEMBER_A = "00000000-0000-0000-0000-00000000a704";
const FAMILY_A1 = "00000000-0000-0000-0000-00000000f701";
const FAMILY_A2 = "00000000-0000-0000-0000-00000000f702";
const FAMILY_B1 = "00000000-0000-0000-0000-00000000f703";
const MINISTRY_A = "00000000-0000-0000-0000-00000000e701";
const ROOM_A = "00000000-0000-0000-0000-00000000e711";
const SERVICE_A = "00000000-0000-0000-0000-00000000e721";
const SERVICE_A2 = "00000000-0000-0000-0000-00000000e722";
const CHILD_1 = "00000000-0000-0000-0000-00000000c701";
const CHILD_2 = "00000000-0000-0000-0000-00000000c702";
const KIOSK_A = "00000000-0000-0000-0000-00000000b701";

describe("kiosk self check-in data (G2.2)", () => {
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
      const suffix = Date.now();
      await client.query(
        `insert into public.churches (id, name, slug) values
           ($1, 'Kiosk A', 'kiosk-a-' || $3), ($2, 'Kiosk B', 'kiosk-b-' || $3)`,
        [CHURCH_A, CHURCH_B, suffix],
      );
      await client.query(
        `insert into auth.users (id, email) values
           ($1, 'kiosk-admin-a@example.test'), ($2, 'kiosk-admin-b@example.test'),
           ($3, 'kiosk-pastor@example.test'), ($4, 'kiosk-member@example.test')`,
        [ADMIN_A, ADMIN_B, PASTOR_A, MEMBER_A],
      );
      await client.query(
        `insert into public.church_memberships (church_id, user_id, role) values
           ($1, $3, 'church_admin'), ($2, $4, 'church_admin'), ($1, $5, 'pastor'), ($1, $6, 'member')`,
        [CHURCH_A, CHURCH_B, ADMIN_A, ADMIN_B, PASTOR_A, MEMBER_A],
      );
      await client.query(
        `insert into public.families (id, church_id, family_name, checkin_code) values
           ($1, $4, 'Rivera', 'HK7M2QX9'), ($2, $4, 'Chen', 'ZZ7M2QX9'), ($3, $5, 'Other', 'HK7M2QX9')`,
        [FAMILY_A1, FAMILY_A2, FAMILY_B1, CHURCH_A, CHURCH_B],
      );
      await client.query(
        `insert into public.ministries (id, church_id, name, slug) values ($1, $2, 'Kids', 'kids-' || $3)`,
        [MINISTRY_A, CHURCH_A, suffix],
      );
      await client.query(
        `insert into public.children_rooms (id, church_id, ministry_id, name) values ($1, $2, $3, 'Nursery')`,
        [ROOM_A, CHURCH_A, MINISTRY_A],
      );
      await client.query(
        `insert into public.ccm_services (id, church_id, ministry_id, service_name) values
           ($1, $3, $4, 'Sunday'), ($2, $3, $4, 'Wednesday')`,
        [SERVICE_A, SERVICE_A2, CHURCH_A, MINISTRY_A],
      );
      await client.query(
        `insert into public.profiles (id, church_id, full_name) values ($1, $3, 'Ana Rivera'), ($2, $3, 'Leo Rivera')`,
        [CHILD_1, CHILD_2, CHURCH_A],
      );
      await testFn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  async function as(client: PoolClient, role: "authenticated" | "anon", userId: string | null, sql: string, values: unknown[] = []) {
    await client.query("savepoint as_role");
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ]);
    try {
      const result = await client.query(sql, values);
      await client.query("release savepoint as_role");
      return { rows: result.rows, rowCount: result.rowCount ?? 0, error: null as string | null };
    } catch (error) {
      await client.query("rollback to savepoint as_role");
      return { rows: [], rowCount: 0, error: (error as Error).message };
    } finally {
      await client.query(`reset role`);
    }
  }

  const checkin = (service: string, child: string | null, status = "checked_in") =>
    `insert into public.ccm_checkin_sessions
       (church_id, service_id, room_id, child_profile_id, child_name, pin_hash, status)
     values ('${CHURCH_A}', '${service}', '${ROOM_A}', ${child ? `'${child}'` : "null"}, 'Kid', 'hash', '${status}')`;

  describe("family check-in codes", () => {
    it("a member cannot read any family's code, including their own church's", async () => {
      await inRolledBackTransaction(async (client) => {
        for (const user of [MEMBER_A, PASTOR_A, ADMIN_A]) {
          const code = await as(client, "authenticated", user, `select checkin_code from public.families`);
          expect(code.error, "select checkin_code").toMatch(/permission denied/);
          const star = await as(client, "authenticated", user, `select * from public.families`);
          expect(star.error, "select *").toMatch(/permission denied/);
          const where = await as(client, "authenticated", user, `select id from public.families where checkin_code = 'HK7M2QX9'`);
          expect(where.error, "filter on checkin_code").toMatch(/permission denied/);
          // The rotation timestamp is not granted either; nothing user-scoped needs it.
          const rotated = await as(client, "authenticated", user, `select checkin_code_rotated_at from public.families`);
          expect(rotated.error).toMatch(/permission denied/);
        }
      });
    });

    it("every other family column is still readable, as before", async () => {
      await inRolledBackTransaction(async (client) => {
        const read = await as(
          client,
          "authenticated",
          MEMBER_A,
          `select id, church_id, family_name, address, home_phone, created_at, updated_at from public.families where church_id = $1 order by family_name`,
          [CHURCH_A],
        );
        expect(read.error).toBeNull();
        expect(read.rows.map((r) => r.family_name)).toEqual(["Chen", "Rivera"]);
        // and the church-admin write path is unchanged
        const update = await as(client, "authenticated", ADMIN_A, `update public.families set address = '1 Main' where id = $1`, [FAMILY_A1]);
        expect(update.error).toBeNull();
        expect(update.rowCount).toBe(1);
      });
    });

    it("anon cannot read the code either", async () => {
      await inRolledBackTransaction(async (client) => {
        expect((await as(client, "anon", null, `select checkin_code from public.families`)).error).toMatch(/permission denied/);
      });
    });

    it("the same code is allowed in two churches but not twice in one", async () => {
      await inRolledBackTransaction(async (client) => {
        // setup already holds HK7M2QX9 in both churches
        const both = await client.query(`select count(*)::int as n from public.families where checkin_code = 'HK7M2QX9' and church_id in ($1, $2)`, [CHURCH_A, CHURCH_B]);
        expect(both.rows[0].n).toBe(2);

        await client.query("savepoint dup");
        await expect(
          client.query(`update public.families set checkin_code = 'HK7M2QX9' where id = $1`, [FAMILY_A2]),
        ).rejects.toThrow(/families_church_checkin_code_idx/);
        await client.query("rollback to savepoint dup");
      });
    });

    it("many families may have no code", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(`update public.families set checkin_code = null where church_id = $1`, [CHURCH_A]);
        expect((await client.query(`select count(*)::int as n from public.families where church_id = $1 and checkin_code is null`, [CHURCH_A])).rows[0].n).toBe(2);
      });
    });

    it("rejects a code with the wrong shape (lowercase, I/L/O/U, wrong length)", async () => {
      await inRolledBackTransaction(async (client) => {
        for (const bad of ["hk7m2qx9", "HK7M2QXI", "HK7M2QXO", "HK7M2QXU", "HK7M2QX", "HK7M2QX99"]) {
          await client.query("savepoint shape");
          await expect(
            client.query(`update public.families set checkin_code = $1 where id = $2`, [bad, FAMILY_A1]),
          ).rejects.toThrow(/checkin_code_check/);
          await client.query("rollback to savepoint shape");
        }
      });
    });

    it("the service role (server code) can read and rotate the code", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(`set local role service_role`);
        const read = await client.query(`select checkin_code from public.families where id = $1`, [FAMILY_A1]);
        expect(read.rows[0].checkin_code).toBe("HK7M2QX9");
        const rotate = await client.query(`update public.families set checkin_code = 'N3WC0DE2' where id = $1`, [FAMILY_A1]);
        expect(rotate.rowCount).toBe(1);
        await client.query(`reset role`);
      });
    });
  });

  describe("profiles.phone_digits", () => {
    it("is the digits of phone, and null for no digits", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(`update public.profiles set phone = '(555) 019-9' where id = $1`, [CHILD_1]);
        await client.query(`update public.profiles set phone = 'n/a' where id = $1`, [CHILD_2]);
        const rows = await client.query(`select id, phone_digits from public.profiles where id in ($1, $2) order by id`, [CHILD_1, CHILD_2]);
        expect(rows.rows).toEqual([
          { id: CHILD_1, phone_digits: "5550199" },
          { id: CHILD_2, phone_digits: null },
        ]);
      });
    });
  });

  describe("ccm_kiosk_sessions", () => {
    const insertSession = `insert into public.ccm_kiosk_sessions (id, church_id, admin_login_id, device_note) values ('${KIOSK_A}', '${CHURCH_A}', '${ADMIN_A}', 'Lobby')`;

    it("a church admin of that church can read it; others and anon cannot", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(insertSession);
        const select = `select id from public.ccm_kiosk_sessions where id = '${KIOSK_A}'`;
        expect((await as(client, "authenticated", ADMIN_A, select)).rows).toHaveLength(1);
        for (const user of [ADMIN_B, PASTOR_A, MEMBER_A]) {
          expect((await as(client, "authenticated", user, select)).rows, user).toEqual([]);
        }
        expect((await as(client, "anon", null, select)).error).toMatch(/permission denied/);
      });
    });

    it("no signed-in user can write it: sessions are created only by server code", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(insertSession);
        for (const user of [ADMIN_A, ADMIN_B, PASTOR_A, MEMBER_A]) {
          expect((await as(client, "authenticated", user, insertSession.replace(KIOSK_A, "00000000-0000-0000-0000-00000000b799"))).error, user).toMatch(/row-level security/);
          expect((await as(client, "authenticated", user, `update public.ccm_kiosk_sessions set ended_at = now() where id = '${KIOSK_A}'`)).rowCount).toBe(0);
          expect((await as(client, "authenticated", user, `delete from public.ccm_kiosk_sessions where id = '${KIOSK_A}'`)).rowCount).toBe(0);
        }
        const still = await client.query(`select ended_at from public.ccm_kiosk_sessions where id = $1`, [KIOSK_A]);
        expect(still.rows[0].ended_at).toBeNull();
      });
    });

    it("is removed with its church", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(insertSession);
        await client.query(`delete from public.ccm_kiosk_sessions where church_id = $1`, [CHURCH_A]);
        expect((await client.query(`select 1 from public.ccm_kiosk_sessions where id = $1`, [KIOSK_A])).rowCount).toBe(0);
      });
    });
  });

  describe("ccm_kiosk_lookup_attempts", () => {
    const insertAttempt = `insert into public.ccm_kiosk_lookup_attempts (church_id, device_id_hash, kind, success) values ('${CHURCH_A}', 'abc', 'phone', false)`;

    it("church managers of that church can read; members, other churches and anon cannot", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(insertAttempt);
        const select = `select id from public.ccm_kiosk_lookup_attempts`;
        expect((await as(client, "authenticated", ADMIN_A, select)).rows).toHaveLength(1);
        expect((await as(client, "authenticated", PASTOR_A, select)).rows).toHaveLength(1);
        expect((await as(client, "authenticated", MEMBER_A, select)).rows).toEqual([]);
        expect((await as(client, "authenticated", ADMIN_B, select)).rows).toEqual([]);
        expect((await as(client, "anon", null, select)).error).toMatch(/permission denied/);
      });
    });

    it("no signed-in user can write it", async () => {
      await inRolledBackTransaction(async (client) => {
        for (const user of [ADMIN_A, PASTOR_A, MEMBER_A, ADMIN_B]) {
          expect((await as(client, "authenticated", user, insertAttempt)).error, user).toMatch(/row-level security/);
        }
      });
    });

    it("only phone, code and exit are valid kinds", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query("savepoint kind");
        await expect(
          client.query(insertAttempt.replace("'phone'", "'name'")),
        ).rejects.toThrow(/kind_check/);
        await client.query("rollback to savepoint kind");
      });
    });
  });

  describe("one active check-in per child per service", () => {
    it("blocks a second active check-in for the same child and service, for every active status", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(checkin(SERVICE_A, CHILD_1));
        for (const status of ["checked_in", "late_pickup", "emergency", "transferred"]) {
          await client.query("savepoint dup");
          await expect(client.query(checkin(SERVICE_A, CHILD_1, status))).rejects.toThrow(/ccm_sessions_one_active_per_child/);
          await client.query("rollback to savepoint dup");
        }
      });
    });

    it("allows the same child at another service, another child at the same service, and a re-check-in after checkout", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(checkin(SERVICE_A, CHILD_1));
        await client.query(checkin(SERVICE_A2, CHILD_1));
        await client.query(checkin(SERVICE_A, CHILD_2));

        await client.query(`update public.ccm_checkin_sessions set status = 'checked_out' where service_id = $1 and child_profile_id = $2`, [SERVICE_A, CHILD_1]);
        await client.query(checkin(SERVICE_A, CHILD_1));
        const n = await client.query(`select count(*)::int as n from public.ccm_checkin_sessions where service_id = $1 and child_profile_id = $2`, [SERVICE_A, CHILD_1]);
        expect(n.rows[0].n).toBe(2);
      });
    });

    it("does not constrain walk-ins without a profile (staff typed a name)", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(checkin(SERVICE_A, null));
        await client.query(checkin(SERVICE_A, null));
      });
    });

    it("checkin_source defaults to staff and only allows staff or kiosk", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(checkin(SERVICE_A, CHILD_1));
        expect((await client.query(`select checkin_source from public.ccm_checkin_sessions`)).rows[0].checkin_source).toBe("staff");
        await client.query("savepoint src");
        await expect(
          client.query(`update public.ccm_checkin_sessions set checkin_source = 'self'`),
        ).rejects.toThrow(/checkin_source_check/);
        await client.query("rollback to savepoint src");
        await client.query(`update public.ccm_checkin_sessions set checkin_source = 'kiosk'`);
      });
    });
  });
});
