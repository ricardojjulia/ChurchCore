import pg from 'pg';

const { Client } = pg;

const controlPlaneTables = [
  'demo_feedback',
  'demo_feedback_rate_limits',
  'platform_admins',
  'profiles',
  'tenant_connections',
  'tenant_view_audit_logs',
  'tenants',
];
const policyFreeControlPlaneTables = new Set(['demo_feedback_rate_limits']);

const surface = process.env.RLS_AUDIT_SURFACE ?? 'tenant';

if (!['tenant', 'control-plane'].includes(surface)) {
  console.error(`audit:rls FAILED — unsupported RLS_AUDIT_SURFACE: ${surface}`);
  process.exit(1);
}

const connectionString = surface === 'control-plane'
  ? process.env.CONTROL_PLANE_DB_URL ?? 'postgresql://postgres:postgres@localhost:4212/postgres'
  : process.env.SUPABASE_DB_URL ??
    process.env.TENANT_DB_URL ??
    'postgresql://postgres:postgres@localhost:4202/postgres';

const client = new Client({ connectionString });

try {
  await client.connect();
} catch (error) {
  console.error(`audit:rls FAILED — ${surface} DB unavailable.`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const tablesResult = surface === 'control-plane'
  ? await client.query(`
  SELECT t.table_name, c.relrowsecurity
  FROM information_schema.tables t
  JOIN pg_class c ON c.relname = t.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name = ANY($1::text[])
  ORDER BY t.table_name;
`, [controlPlaneTables])
  : await client.query(`
  SELECT t.table_name, c.relrowsecurity
  FROM information_schema.columns col
  JOIN information_schema.tables t
    ON t.table_name = col.table_name AND t.table_schema = col.table_schema
  JOIN pg_class c ON c.relname = t.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
  WHERE col.column_name = 'church_id'
    AND t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
`);

const rows = tablesResult.rows;

console.log(`RLS AUDIT — ${surface} DB`);
console.log('');

if (rows.length === 0) {
  console.error(
    surface === 'control-plane'
      ? 'audit:rls FAILED — required demo_feedback table was not found.'
      : 'audit:rls FAILED — no tenant tables with a church_id column were found.'
  );
  await client.end();
  process.exit(1);
}

if (surface === 'control-plane') {
  const discovered = new Set(rows.map((row) => row.table_name));
  const missing = controlPlaneTables.filter((table) => !discovered.has(table));
  if (missing.length > 0) {
    console.error(`audit:rls FAILED — missing control-plane tables: ${missing.join(', ')}`);
    await client.end();
    process.exit(1);
  }
}

let failCount = 0;

for (const row of rows) {
  const { table_name, relrowsecurity } = row;

  if (!relrowsecurity) {
    console.log(`  ✗ ${table_name.padEnd(40)} RLS DISABLED`);
    failCount++;
  } else {
    const policyResult = await client.query(
      `SELECT count(*) FROM pg_policy WHERE polrelid = $1::regclass;`,
      [`public.${table_name}`]
    );
    const policyCount = parseInt(policyResult.rows[0].count, 10);

    if (policyCount === 0 && policyFreeControlPlaneTables.has(table_name)) {
      console.log(`  ✓ ${table_name.padEnd(40)} RLS enabled, service-role-only (0 policies)`);
    } else if (policyCount === 0) {
      console.log(`  ⚠ ${table_name.padEnd(40)} RLS enabled but 0 policies (all access blocked)`);
      failCount++;
    } else {
      console.log(`  ✓ ${table_name.padEnd(40)} RLS enabled, ${policyCount} ${policyCount === 1 ? 'policy' : 'policies'}`);
    }
  }
}

console.log('');

if (failCount > 0) {
  console.log(`audit:rls FAILED — ${failCount} table(s) need attention.`);
  await client.end();
  process.exit(1);
} else {
  console.log('audit:rls PASSED');
  await client.end();
  process.exit(0);
}
