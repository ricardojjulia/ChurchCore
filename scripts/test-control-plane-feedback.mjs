import assert from 'node:assert/strict';
import pg from 'pg';

const { Client } = pg;
const connectionString =
  process.env.CONTROL_PLANE_DB_URL ??
  'postgresql://postgres:postgres@localhost:4212/postgres';
const runId = `ci-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function submissionValues({ sessionKey, fingerprint }) {
  return [
    sessionKey,
    fingerprint,
    `${runId}-session`,
    '/integration/control-feedback',
    'BUG',
    'integration error',
    'integration note',
    '[]',
    null,
    'tester',
    'integration',
    12,
    JSON.stringify({ runId }),
  ];
}

const submitSql = `select public.submit_demo_feedback(
  $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb
) as accepted`;

async function submit(values) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('set role service_role');
    const result = await client.query(submitSql, values);
    return result.rows[0].accepted;
  } finally {
    await client.end();
  }
}

const admin = new Client({ connectionString });
await admin.connect();

try {
  const rateSession = `${runId}-rate`;
  const accepted = await Promise.all(
    Array.from({ length: 21 }, (_, index) =>
      submit(submissionValues({
        sessionKey: rateSession,
        fingerprint: `${runId}-rate-${index}`,
      })),
    ),
  );
  assert.equal(accepted.filter(Boolean).length, 20, 'exactly 20 concurrent submissions must pass');
  assert.equal(accepted.filter((value) => !value).length, 1, 'the 21st concurrent submission must be limited');

  const dedupeSession = `${runId}-dedupe-session`;
  const dedupeFingerprint = `${runId}-dedupe`;
  assert.equal(await submit(submissionValues({ sessionKey: dedupeSession, fingerprint: dedupeFingerprint })), true);
  assert.equal(await submit(submissionValues({ sessionKey: dedupeSession, fingerprint: dedupeFingerprint })), true);

  let row = await admin.query(
    'select id, hit_count, processed, action from public.demo_feedback where fingerprint = $1',
    [dedupeFingerprint],
  );
  assert.equal(row.rowCount, 1, 'deduplication must retain one row');
  assert.equal(row.rows[0].hit_count, 2, 'deduplication must increment hit_count');

  await admin.query(
    `update public.demo_feedback
     set processed = true, action = 'bug_fixed'
     where fingerprint = $1`,
    [dedupeFingerprint],
  );
  assert.equal(await submit(submissionValues({ sessionKey: dedupeSession, fingerprint: dedupeFingerprint })), true);

  row = await admin.query(
    'select hit_count, processed, action from public.demo_feedback where fingerprint = $1',
    [dedupeFingerprint],
  );
  assert.deepEqual(row.rows[0], { hit_count: 3, processed: false, action: null });

  await admin.query('begin');
  await admin.query('set local role authenticated');
  await admin.query(
    `select set_config('request.jwt.claim.sub', $1, true)`,
    ['00000000-0000-0000-0000-000000000099'],
  );
  const deniedSelect = await admin.query(
    'select id from public.demo_feedback where fingerprint = $1',
    [dedupeFingerprint],
  );
  assert.equal(deniedSelect.rowCount, 0, 'wrong-role authenticated users must not read feedback');
  const deniedUpdate = await admin.query(
    `update public.demo_feedback set processed = true where fingerprint = $1 returning id`,
    [dedupeFingerprint],
  );
  assert.equal(deniedUpdate.rowCount, 0, 'wrong-role authenticated users must not update feedback');
  await admin.query('rollback');

  console.log('control-plane feedback integration PASSED');
} finally {
  await admin.query('reset role').catch(() => {});
  await admin.query('rollback').catch(() => {});
  await admin.query('delete from public.demo_feedback where fingerprint like $1', [`${runId}%`]);
  await admin.query('delete from public.demo_feedback_rate_limits where session_key_hash like $1', [`${runId}%`]);
  await admin.end();
}
