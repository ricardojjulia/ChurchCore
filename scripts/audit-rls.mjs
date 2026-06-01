import pg from 'pg';

const { Client } = pg;

const connectionString =
  process.env.SUPABASE_DB_URL ??
  process.env.TENANT_DB_URL ??
  'postgresql://postgres:postgres@localhost:4202/postgres';

const client = new Client({ connectionString });

try {
  await client.connect();
} catch {
  console.log(
    'DB unavailable — skipping RLS audit (set SUPABASE_DB_URL or TENANT_DB_URL to a running tenant DB)'
  );
  process.exit(0);
}

const tablesResult = await client.query(`
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

console.log('RLS AUDIT — tenant DB');
console.log('');

if (rows.length === 0) {
  console.log('  (no tables with church_id column found)');
  console.log('');
  console.log('audit:rls PASSED');
  await client.end();
  process.exit(0);
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

    if (policyCount === 0) {
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
