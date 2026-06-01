import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

const FILENAME_RE = /^\d{14}_[a-z0-9_-]+\.sql$/;

const files = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

const failures = [];
const warnings = [];

const seenTimestamps = new Map();

for (const file of files) {
  if (!FILENAME_RE.test(file)) {
    failures.push(`  ${file} — malformed filename`);
  }
  const ts = file.slice(0, 14);
  if (seenTimestamps.has(ts)) {
    failures.push(`  ${file} — duplicate timestamp (conflicts with ${seenTimestamps.get(ts)})`);
  } else {
    seenTimestamps.set(ts, file);
  }
}

const rlsEnabledTables = new Set();

for (const file of files) {
  const filePath = join(MIGRATIONS_DIR, file);
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  if (!content.endsWith('\n')) {
    warnings.push(`  ${file} — missing trailing newline (warning only)`);
  }

  const rlsMatches = content.matchAll(
    /alter\s+table\s+(?:public\.)?(\w+)\s+enable\s+row\s+level\s+security/gi
  );
  for (const m of rlsMatches) {
    rlsEnabledTables.add(m[1].toLowerCase());
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^DROP\s+TABLE\b/i.test(line) || /^DROP\s+COLUMN\b/i.test(line)) {
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (!prevLine.startsWith('--')) {
        const keyword = /^DROP\s+TABLE\b/i.test(line) ? 'DROP TABLE' : 'DROP COLUMN';
        failures.push(`  ${file} — ${keyword} without comment guard (line ${i + 1})`);
      }
    }
  }

  const createTableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi;
  let match;
  while ((match = createTableRe.exec(content)) !== null) {
    const tableName = match[1].toLowerCase();
    const blockSlice = content.slice(match.index, match.index + 1500);
    const hasChurchId = /create\s+table[^;]*church_id/si.test(blockSlice);
    if (hasChurchId && !rlsEnabledTables.has(tableName)) {
      failures.push(
        `  ${file} — table \`${tableName}\` has church_id column but no ENABLE ROW LEVEL SECURITY found`
      );
    }
  }
}

if (warnings.length > 0) {
  for (const w of warnings) {
    console.log(`WARN ${w}`);
  }
}

if (failures.length === 0) {
  console.log('PASS lint-migrations');
  process.exit(0);
} else {
  console.log('FAIL lint-migrations');
  for (const f of failures) {
    console.log(f);
  }
  console.log(`${failures.length} issue(s) found.`);
  process.exit(1);
}
