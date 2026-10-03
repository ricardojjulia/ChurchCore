import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

// Real-Postgres coverage for post_donation_to_gl (G3.2, PR #177 review):
// the ledger post is one transaction, one caller at a time per gift, so
// concurrent completions of the same gift post exactly one journal. Also:
// only the server (service role) may call it. These tests commit (the
// concurrency needs separate connections), then delete their church.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

const CHURCH = "00000000-0000-0000-0000-0000000000c7";

/**
 * Removes the test church's rows table by table, with triggers off for this
 * session: deleting the church itself would cascade into tables whose audit
 * triggers then reference the church being deleted.
 */
async function cleanUp(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("set session_replication_role = replica");
    for (const table of ["donation_gl_posts", "finance_journal_lines", "finance_journals", "donations", "giving_fund_accounts", "finance_accounts", "audit_log"]) {
      await client.query(`delete from public.${table} where church_id = $1`, [CHURCH]);
    }
    await client.query(`delete from public.churches where id = $1`, [CHURCH]);
  } finally {
    await client.query("set session_replication_role = origin");
    client.release();
  }
}

describe("post_donation_to_gl", () => {
  let pool: Pool;
  let donationId = "";

  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8 });
    await cleanUp(pool);
    await pool.query(`insert into public.churches (id, name, slug) values ($1, 'Ledger test', 'ledger-test-' || $2)`, [CHURCH, Date.now()]);
    const accounts = await pool.query<{ id: string }>(
      `insert into public.finance_accounts (church_id, account_code, name, account_type) values
         ($1, '1000', 'Cash', 'asset'), ($1, '4000', 'Giving', 'income')
       returning id`,
      [CHURCH],
    );
    await pool.query(
      `insert into public.giving_fund_accounts (church_id, fund_designation, asset_account_id, income_account_id) values ($1, 'General', $2, $3)`,
      [CHURCH, accounts.rows[0].id, accounts.rows[1].id],
    );
    const gift = await pool.query<{ id: string }>(
      `insert into public.donations (church_id, amount_cents, status, fund_designation) values ($1, 2500, 'succeeded', 'General') returning id`,
      [CHURCH],
    );
    donationId = gift.rows[0].id;
  });

  afterAll(async () => {
    await cleanUp(pool);
    await pool.end();
  });

  it("posts one balanced journal however many callers race to post the same gift", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => pool.query<{ result: string }>(`select public.post_donation_to_gl($1, $2) as result`, [donationId, CHURCH])),
    );
    const outcomes = results.map((r) => r.rows[0].result).sort();
    expect(outcomes.filter((o) => o === "posted")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "already_posted")).toHaveLength(5);

    const journals = await pool.query(`select id from public.finance_journals where church_id = $1 and reference = $2`, [CHURCH, donationId]);
    expect(journals.rowCount).toBe(1);
    const lines = await pool.query<{ side: string; amount_cents: number }>(
      `select side, amount_cents from public.finance_journal_lines where journal_id = $1 order by sort_order`,
      [journals.rows[0].id],
    );
    expect(lines.rows).toEqual([
      { side: "debit", amount_cents: 2500 },
      { side: "credit", amount_cents: 2500 },
    ]);
    const posts = await pool.query(`select 1 from public.donation_gl_posts where donation_id = $1`, [donationId]);
    expect(posts.rowCount).toBe(1);
  });

  it("refuses another church's gift, and a fund with no mapping", async () => {
    const other = await pool.query<{ result: string }>(`select public.post_donation_to_gl($1, gen_random_uuid()) as result`, [donationId]);
    expect(other.rows[0].result).toBe("missing");
    const unmapped = await pool.query<{ id: string }>(
      `insert into public.donations (church_id, amount_cents, status, fund_designation) values ($1, 100, 'succeeded', 'Unmapped') returning id`,
      [CHURCH],
    );
    const result = await pool.query<{ result: string }>(`select public.post_donation_to_gl($1, $2) as result`, [unmapped.rows[0].id, CHURCH]);
    expect(result.rows[0].result).toBe("unmapped");
  });

  it("is callable only by the server (service role), never by anon or a signed-in user", async () => {
    const grants = await pool.query<{ role: string; allowed: boolean }>(
      `select role, has_function_privilege(role, 'public.post_donation_to_gl(uuid, uuid)', 'execute') as allowed
       from unnest(array['anon', 'authenticated', 'service_role']) as role`,
    );
    expect(Object.fromEntries(grants.rows.map((r) => [r.role, r.allowed]))).toEqual({ anon: false, authenticated: false, service_role: true });
  });
});
