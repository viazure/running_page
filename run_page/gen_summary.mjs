/**
 * Run `gen_summary.py` from the build pipeline, without making the build depend
 * on Python being present.
 *
 * The summary aggregates (training load, VO2max, HR zones, best efforts) are an
 * enhancement layer: `useSummaryAggregates` treats a missing aggregates.json as
 * "L0-only" and hides the analysis cards. So a contributor on a machine without
 * Python must still be able to run `pnpm build`, and a generator crash should
 * surface as a warning rather than a failed deploy.
 *
 * CI is the place that must succeed: there `public/splits/` has been restored
 * from the Actions cache, so the script produces real data.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = path.join(ROOT, 'run_page', 'gen_summary.py');
const OUT = path.join(ROOT, 'public', 'summary', 'aggregates.json');

/** Interpreters to try, in order. Windows ships `python`, POSIX usually `python3`. */
const CANDIDATES = ['python3', 'python'];

function findPython() {
  for (const bin of CANDIDATES) {
    const probe = spawnSync(bin, ['--version'], {
      stdio: 'ignore',
      shell: false,
    });
    if (probe.status === 0) return bin;
  }
  return null;
}

function main() {
  if (!fs.existsSync(SCRIPT)) {
    console.warn('[summary] run_page/gen_summary.py not found — skipping');
    return 0;
  }

  const python = findPython();
  if (!python) {
    console.warn(
      '[summary] no python interpreter found — skipping aggregates ' +
        '(analysis cards will stay hidden; this is fine for a frontend-only build)'
    );
    return 0;
  }

  const result = spawnSync(python, [SCRIPT], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.warn(`[summary] failed to run generator: ${result.error.message}`);
    return 0;
  }
  if (result.status !== 0) {
    console.warn(
      `[summary] generator exited ${result.status} — continuing without fresh aggregates`
    );
    return 0;
  }
  if (!fs.existsSync(OUT)) {
    console.warn('[summary] generator produced no output — continuing');
  }
  return 0;
}

process.exit(main());
