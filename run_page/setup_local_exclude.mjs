/**
 * Sync docs/local-exclude.txt into this clone's .git/info/exclude.
 *
 * Why not `git config core.excludesFile`: that setting is global, so the rules
 * would apply to every other repository on the machine. `.git/info/exclude` is
 * per-clone and never pushed, which is exactly the scope we want.
 *
 * The block is delimited by markers so re-running after a pull replaces it
 * instead of appending duplicates, and any lines you added by hand outside the
 * block are preserved.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMPLATE = path.join(ROOT, 'docs', 'local-exclude.txt');
const EXCLUDE = path.join(ROOT, '.git', 'info', 'exclude');

const BEGIN = '# >>> local-exclude.txt (managed by `pnpm run setup:exclude`) >>>';
const END = '# <<< local-exclude.txt <<<';

function main() {
  if (!fs.existsSync(TEMPLATE)) {
    console.error(`[exclude] missing template: ${TEMPLATE}`);
    return 1;
  }
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.error('[exclude] not a git clone (.git not found)');
    return 1;
  }

  const template = fs.readFileSync(TEMPLATE, 'utf8').trimEnd();
  const existing = fs.existsSync(EXCLUDE)
    ? fs.readFileSync(EXCLUDE, 'utf8')
    : '';

  // Drop a previous managed block, keep everything the user wrote themselves.
  const kept = [];
  let inside = false;
  for (const line of existing.split(/\r?\n/)) {
    if (line === BEGIN) {
      inside = true;
      continue;
    }
    if (line === END) {
      inside = false;
      continue;
    }
    if (!inside) kept.push(line);
  }

  const manual = kept.join('\n').trimEnd();
  const block = [BEGIN, template, END].join('\n');
  const next = manual ? `${manual}\n\n${block}\n` : `${block}\n`;

  fs.mkdirSync(path.dirname(EXCLUDE), { recursive: true });
  fs.writeFileSync(EXCLUDE, next, 'utf8');

  const rules = template
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trimStart().startsWith('#')).length;
  console.log(`[exclude] wrote ${rules} rules -> ${path.relative(ROOT, EXCLUDE)}`);
  return 0;
}

process.exit(main());
