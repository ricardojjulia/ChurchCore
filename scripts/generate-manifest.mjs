import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const OUTPUT_PATH = join(REPO_ROOT, 'supabase', 'schema-manifest.json');

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

const CONSTRAINT_PREFIXES = [
  'constraint', 'primary key', 'foreign key', 'unique', 'check', 'index',
  'exclude', ')', ','
];

function isColumnDef(line) {
  const trimmed = line.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith('--')) return false;
  for (const prefix of CONSTRAINT_PREFIXES) {
    if (trimmed.startsWith(prefix)) return false;
  }
  return /^[a-z_][a-z0-9_]*\s+/i.test(trimmed);
}

function extractColumns(blockContent) {
  const openIdx = blockContent.indexOf('(');
  if (openIdx === -1) return [];

  let depth = 0;
  let bodyStart = -1;
  let bodyEnd = -1;

  for (let i = openIdx; i < blockContent.length; i++) {
    if (blockContent[i] === '(') {
      depth++;
      if (depth === 1) bodyStart = i + 1;
    } else if (blockContent[i] === ')') {
      depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }

  if (bodyStart === -1 || bodyEnd === -1) return [];

  const body = blockContent.slice(bodyStart, bodyEnd);
  const rawLines = body.split(/\n/);
  const columns = [];

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/,$/, '').trim();
    if (!isColumnDef(line)) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    columns.push({
      name: tokens[0].toLowerCase().replace(/"/g, ''),
      type: tokens[1].toLowerCase().replace(/,/g, ''),
    });
  }
  return columns;
}

const tables = {};

for (const file of migrationFiles) {
  const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  const createTableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi;

  let match;
  while ((match = createTableRe.exec(content)) !== null) {
    const tableName = match[1].toLowerCase();
    const blockSlice = content.slice(match.index, match.index + 8000);
    try {
      const columns = extractColumns(blockSlice);
      if (columns.length === 0) {
        console.warn(`WARN: no columns extracted for table \`${tableName}\` in ${file} — skipping`);
        continue;
      }
      tables[tableName] = { columns };
    } catch (e) {
      console.warn(`WARN: failed to parse table \`${tableName}\` in ${file}: ${e.message}`);
    }
  }
}

const sortedTables = Object.fromEntries(
  Object.entries(tables).sort(([a], [b]) => a.localeCompare(b))
);

const manifest = {
  generated_at: new Date().toISOString(),
  migration_count: migrationFiles.length,
  tables: sortedTables,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Generated supabase/schema-manifest.json — ${Object.keys(sortedTables).length} tables`
);
