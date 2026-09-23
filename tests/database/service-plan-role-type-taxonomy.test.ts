import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

// Covers two things the mocked unit tests in
// app/app/service-plan-role-type-actions.test.ts cannot exercise against a
// real Postgres instance:
//
// 1. The `role_name` → `service_plan_role_types` backfill logic from
//    supabase/migrations/20260924000000_service_plan_role_taxonomy.sql —
//    specifically the DISTINCT ON + lower(name) collapse behavior that
//    makes case-only spelling collisions collapse to one row while
//    genuinely different spellings stay separate, and the
//    coalesce(nullif(trim(...), ''), 'Unnamed Role') handling of
//    blank/whitespace-only legacy names. The migration has already run
//    once against this local database (role_type_id is NOT NULL on
//    service_plan_positions already), so this test replays the exact same
//    backfill query body against a scratch temporary table standing in for
//    "legacy" role_name rows, rather than the (already-migrated,
//    NOT-NULL-constrained) real service_plan_positions table.
// 2. The spr_types_church_lower_name_active_idx partial unique index's
//    real DB-level enforcement of case-insensitive uniqueness among ACTIVE
//    role types only, including the "deactivate, then reuse the same name"
//    path — complementing the mocked 23505-error-handling tests in
//    app/app/service-plan-role-type-actions.test.ts with the real
//    constraint those mocks stand in for.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

// Verbatim copy of the backfill SELECT from
// supabase/migrations/20260924000000_service_plan_role_taxonomy.sql,
// re-pointed at a scratch `legacy_positions` temp table (church_id, role_name)
// standing in for the pre-migration shape of service_plan_positions. The
// target table, ON CONFLICT arbiter, and normalization expression are
// identical to the migration.
const BACKFILL_INSERT = `
  insert into public.service_plan_role_types (church_id, name)
  select distinct on (lp.church_id, lower(coalesce(nullif(trim(lp.role_name), ''), 'Unnamed Role')))
         lp.church_id,
         coalesce(nullif(trim(lp.role_name), ''), 'Unnamed Role') as name
  from legacy_positions lp
  order by lp.church_id,
           lower(coalesce(nullif(trim(lp.role_name), ''), 'Unnamed Role')),
           lp.role_name
  on conflict (church_id, lower(name)) where is_active do nothing
`;

describe("service_plan_role_types taxonomy migration & constraints", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  const runTestInTransaction = async (
    testFn: (client: PoolClient, churchId: string) => Promise<void>,
  ) => {
    const client = await pool.connect();
    const churchId = "00000000-0000-0000-0000-0000000000f2";
    try {
      await client.query("BEGIN");
      await client.query(
        `insert into public.churches (id, name, slug) values ($1, $2, $3)
         on conflict (id) do nothing`,
        [churchId, "Role Taxonomy Test Church", `role-taxonomy-test-${Date.now()}`],
      );
      await client.query(
        `create temporary table legacy_positions (church_id uuid, role_name text) on commit drop`,
      );
      await testFn(client, churchId);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };

  describe("backfill: case-collision collapse vs. distinct-spelling separation", () => {
    it("collapses case-only spelling collisions to a single active role type row", async () => {
      await runTestInTransaction(async (client, churchId) => {
        await client.query(
          `insert into legacy_positions (church_id, role_name) values
             ($1, 'Sound Tech'), ($1, 'sound tech'), ($1, 'SOUND TECH')`,
          [churchId],
        );

        await client.query(BACKFILL_INSERT);

        const res = await client.query(
          `select name from public.service_plan_role_types where church_id = $1`,
          [churchId],
        );
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].name.toLowerCase()).toBe("sound tech");
      });
    });

    it("keeps genuinely different spellings as separate role types (no fuzzy merge)", async () => {
      await runTestInTransaction(async (client, churchId) => {
        await client.query(
          `insert into legacy_positions (church_id, role_name) values
             ($1, 'Sound Tech'), ($1, 'Sound Techs'), ($1, 'Greeter')`,
          [churchId],
        );

        await client.query(BACKFILL_INSERT);

        const res = await client.query(
          `select name from public.service_plan_role_types where church_id = $1 order by name`,
          [churchId],
        );
        expect(res.rows.map((r) => r.name)).toEqual(["Greeter", "Sound Tech", "Sound Techs"]);
      });
    });

    it("coalesces blank/whitespace-only legacy role_name values to 'Unnamed Role' instead of dropping them", async () => {
      await runTestInTransaction(async (client, churchId) => {
        await client.query(
          `insert into legacy_positions (church_id, role_name) values
             ($1, ''), ($1, '   '), ($1, null)`,
          [churchId],
        );

        await client.query(BACKFILL_INSERT);

        const res = await client.query(
          `select name from public.service_plan_role_types where church_id = $1`,
          [churchId],
        );
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].name).toBe("Unnamed Role");
      });
    });

    it("is idempotent — re-running the backfill against the same legacy rows creates no duplicate rows", async () => {
      await runTestInTransaction(async (client, churchId) => {
        await client.query(
          `insert into legacy_positions (church_id, role_name) values
             ($1, 'Sound Tech'), ($1, 'Greeter')`,
          [churchId],
        );

        await client.query(BACKFILL_INSERT);
        await client.query(BACKFILL_INSERT);
        await client.query(BACKFILL_INSERT);

        const res = await client.query(
          `select name from public.service_plan_role_types where church_id = $1 order by name`,
          [churchId],
        );
        expect(res.rows.map((r) => r.name)).toEqual(["Greeter", "Sound Tech"]);
      });
    });

    it("scopes distinct role types per church — the same spelling in two churches yields two rows", async () => {
      const client = await pool.connect();
      const churchA = "00000000-0000-0000-0000-0000000000f3";
      const churchB = "00000000-0000-0000-0000-0000000000f4";
      try {
        await client.query("BEGIN");
        await client.query(
          `insert into public.churches (id, name, slug) values ($1, $2, $3), ($4, $5, $6)
           on conflict (id) do nothing`,
          [
            churchA, "Role Taxonomy Test Church A", `role-taxonomy-a-${Date.now()}`,
            churchB, "Role Taxonomy Test Church B", `role-taxonomy-b-${Date.now()}`,
          ],
        );
        await client.query(
          `create temporary table legacy_positions (church_id uuid, role_name text) on commit drop`,
        );
        await client.query(
          `insert into legacy_positions (church_id, role_name) values ($1, 'Usher'), ($2, 'Usher')`,
          [churchA, churchB],
        );

        await client.query(BACKFILL_INSERT);

        const res = await client.query(
          `select church_id, name from public.service_plan_role_types where church_id in ($1, $2)`,
          [churchA, churchB],
        );
        expect(res.rows).toHaveLength(2);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });
  });

  describe("spr_types_church_lower_name_active_idx (real constraint, not mocked)", () => {
    it("rejects a case-insensitive duplicate active name for the same church at the DB level", async () => {
      await runTestInTransaction(async (client, churchId) => {
        await client.query(
          `insert into public.service_plan_role_types (church_id, name) values ($1, 'Greeter')`,
          [churchId],
        );

        await expect(
          client.query(
            `insert into public.service_plan_role_types (church_id, name) values ($1, 'GREETER')`,
            [churchId],
          ),
        ).rejects.toThrow(/duplicate key value violates unique constraint/);
      });
    });

    it("allows reusing a name after the original active row is deactivated (no reactivate path needed)", async () => {
      await runTestInTransaction(async (client, churchId) => {
        const first = await client.query(
          `insert into public.service_plan_role_types (church_id, name) values ($1, 'Greeter') returning id`,
          [churchId],
        );
        await client.query(
          `update public.service_plan_role_types set is_active = false where id = $1`,
          [first.rows[0].id],
        );

        const second = await client.query(
          `insert into public.service_plan_role_types (church_id, name) values ($1, 'Greeter') returning id`,
          [churchId],
        );
        expect(second.rows[0].id).not.toBe(first.rows[0].id);
      });
    });

    it("allows the same active name in two different churches (church-scoped uniqueness)", async () => {
      const client = await pool.connect();
      const churchA = "00000000-0000-0000-0000-0000000000f5";
      const churchB = "00000000-0000-0000-0000-0000000000f6";
      try {
        await client.query("BEGIN");
        await client.query(
          `insert into public.churches (id, name, slug) values ($1, $2, $3), ($4, $5, $6)
           on conflict (id) do nothing`,
          [
            churchA, "Role Taxonomy Test Church A2", `role-taxonomy-a2-${Date.now()}`,
            churchB, "Role Taxonomy Test Church B2", `role-taxonomy-b2-${Date.now()}`,
          ],
        );

        await client.query(
          `insert into public.service_plan_role_types (church_id, name) values ($1, 'Greeter')`,
          [churchA],
        );
        await expect(
          client.query(
            `insert into public.service_plan_role_types (church_id, name) values ($1, 'Greeter')`,
            [churchB],
          ),
        ).resolves.toBeDefined();
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });
  });

  describe("service_plan_positions.role_type_id FK", () => {
    it("restricts hard-deleting a role type that is still referenced by a position", async () => {
      await runTestInTransaction(async (client, churchId) => {
        const roleType = await client.query(
          `insert into public.service_plan_role_types (church_id, name) values ($1, 'Greeter') returning id`,
          [churchId],
        );
        const plan = await client.query(
          `insert into public.service_plans (church_id, name, service_date, service_type, status)
           values ($1, 'Test Plan', current_date, 'worship', 'draft') returning id`,
          [churchId],
        );
        await client.query(
          `insert into public.service_plan_positions (plan_id, church_id, role_type_id, quantity_needed)
           values ($1, $2, $3, 1)`,
          [plan.rows[0].id, churchId, roleType.rows[0].id],
        );

        await expect(
          client.query(`delete from public.service_plan_role_types where id = $1`, [roleType.rows[0].id]),
        ).rejects.toThrow();
      });
    });

    it("deactivating (soft-delete) a role type still referenced by a position is never delete-blocked", async () => {
      // Contrast with the hard-delete case above: deactivation is an UPDATE
      // (is_active = false), so it never touches the ON DELETE RESTRICT FK
      // and must succeed regardless of how many positions reference the
      // role type.
      await runTestInTransaction(async (client, churchId) => {
        const roleType = await client.query(
          `insert into public.service_plan_role_types (church_id, name) values ($1, 'Greeter') returning id`,
          [churchId],
        );
        const plan = await client.query(
          `insert into public.service_plans (church_id, name, service_date, service_type, status)
           values ($1, 'Test Plan', current_date, 'worship', 'draft') returning id`,
          [churchId],
        );
        await client.query(
          `insert into public.service_plan_positions (plan_id, church_id, role_type_id, quantity_needed)
           values ($1, $2, $3, 1)`,
          [plan.rows[0].id, churchId, roleType.rows[0].id],
        );

        await expect(
          client.query(
            `update public.service_plan_role_types set is_active = false where id = $1`,
            [roleType.rows[0].id],
          ),
        ).resolves.toBeDefined();

        const res = await client.query(
          `select is_active from public.service_plan_role_types where id = $1`,
          [roleType.rows[0].id],
        );
        expect(res.rows[0].is_active).toBe(false);
      });
    });

    it("stays valid on existing positions — a deactivated role type's name/required_skills still resolve via join", async () => {
      // Mirrors the live-join query lib/volunteer-data.ts's getServicePlanDetail
      // runs (no `where spr.is_active` filter) — deactivating a role type
      // must never break the display of positions/history that already
      // reference it.
      await runTestInTransaction(async (client, churchId) => {
        const roleType = await client.query(
          `insert into public.service_plan_role_types (church_id, name, required_skills)
           values ($1, 'Sound Tech', array['audio']) returning id`,
          [churchId],
        );
        const plan = await client.query(
          `insert into public.service_plans (church_id, name, service_date, service_type, status)
           values ($1, 'Test Plan', current_date, 'worship', 'draft') returning id`,
          [churchId],
        );
        await client.query(
          `insert into public.service_plan_positions (plan_id, church_id, role_type_id, quantity_needed)
           values ($1, $2, $3, 1)`,
          [plan.rows[0].id, churchId, roleType.rows[0].id],
        );
        await client.query(
          `update public.service_plan_role_types set is_active = false where id = $1`,
          [roleType.rows[0].id],
        );

        const res = await client.query(
          `select spr.name, spr.required_skills
           from public.service_plan_positions spp
           join public.service_plan_role_types spr on spr.id = spp.role_type_id
           where spp.plan_id = $1`,
          [plan.rows[0].id],
        );
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].name).toBe("Sound Tech");
        expect(res.rows[0].required_skills).toEqual(["audio"]);
      });
    });
  });
});
