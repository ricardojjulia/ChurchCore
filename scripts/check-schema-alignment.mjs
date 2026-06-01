import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

const migrationTables = new Set();

for (const file of migrationFiles) {
  const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  const matches = content.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi
  );
  for (const m of matches) {
    migrationTables.add(m[1].toLowerCase());
  }
}

const CODE_DIRS = ['lib', 'app', 'components'].map(d => join(REPO_ROOT, d));

const codeTables = new Set();
const codeRefs = {};

function walkDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      let content;
      try {
        content = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const matches = content.matchAll(/\.from\(["']([^"']+)["']\)/g);
      for (const m of matches) {
        const tname = m[1].toLowerCase();
        codeTables.add(tname);
        if (!codeRefs[tname]) codeRefs[tname] = [];
        const rel = full.replace(REPO_ROOT + '/', '');
        if (!codeRefs[tname].includes(rel)) codeRefs[tname].push(rel);
      }
    }
  }
}

for (const dir of CODE_DIRS) {
  walkDir(dir);
}

const phantoms = [...codeTables].filter(t => !migrationTables.has(t)).sort();
const orphans  = [...migrationTables].filter(t => !codeTables.has(t)).sort();

if (phantoms.length > 0) {
  console.log('PHANTOM TABLES (in code, not in migrations):');
  for (const t of phantoms) {
    const refs = (codeRefs[t] || []).slice(0, 3).join(', ');
    console.log(`  ${t}  ← referenced in: ${refs}`);
  }
  console.log('');
}

console.log('ORPHANED TABLES (in migrations, not in code):');
if (orphans.length === 0) {
  console.log('  (none)');
} else {
  for (const t of orphans) {
    console.log(`  ${t}`);
  }
}

console.log('');

if (phantoms.length > 0) {
  console.log(`check:schema FAILED — ${phantoms.length} phantom table(s) found.`);
  process.exit(1);
} else {
  console.log('check:schema PASSED — no phantom tables.');
  process.exit(0);
}
