#!/usr/bin/env node
/**
 * Split src/static/activities.json into two payloads so the first paint does not
 * wait for track geometry:
 *
 *   public/data/activities.lite.json    - summary fields only (no polyline/location)
 *   public/data/activities.tracks.json  - { "<run_id>": "<encoded polyline>" }
 *
 * The map / tracks wall fetch the tracks file after the page is interactive.
 * Both files are generated build artifacts and must stay out of git.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src', 'static', 'activities.json');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const LITE = path.join(OUT_DIR, 'activities.lite.json');
const TRACKS = path.join(OUT_DIR, 'activities.tracks.json');

function main() {
  if (!fs.existsSync(SRC)) {
    console.warn('[lite] missing', SRC, '- skipping');
    return;
  }

  let activities;
  try {
    activities = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  } catch (err) {
    console.error('[lite] cannot parse activities.json:', err.message);
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(activities)) {
    console.error('[lite] activities.json is not an array');
    process.exitCode = 1;
    return;
  }

  const lite = [];
  const tracks = {};

  for (const a of activities) {
    const { summary_polyline, ...rest } = a;
    // `location_country` stays: the footprint map and PB grouping read it.
    // Only geometry moves to the sidecar.
    const hasGps =
      typeof summary_polyline === 'string' && summary_polyline.length > 20;
    // PB needs "is this an outdoor run", not the geometry itself — a flag keeps
    // it instant instead of waiting for the ~2MB track sidecar.
    lite.push({ ...rest, summary_polyline: null, has_gps: hasGps });
    if (hasGps) tracks[String(a.run_id)] = summary_polyline;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(LITE, JSON.stringify(lite), 'utf8');
  fs.writeFileSync(TRACKS, JSON.stringify(tracks), 'utf8');

  const kb = (p) => Math.round(fs.statSync(p).size / 1024);
  console.log(
    `[lite] activities=${activities.length} lite=${kb(LITE)}KB tracks=${kb(TRACKS)}KB`
  );
}

main();
