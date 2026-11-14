import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_LTHR_PERCENTS,
  DEFAULT_MAXHR_PERCENTS,
  ageOnActivityDate,
  estimatedMaxHrFromAge,
  estimatedMaxHrFromBirthday,
  hrZoneBoundsMatch,
  hrZonesFromChart,
  isDeviceHrZone,
  lthrHighBounds,
  resolveHrZones,
} from './runHrZones.ts';
import type { ZoneInfo } from './splits.ts';

const LTHR = 176;
const MAX_HR = 189;
const SITE = lthrHighBounds(LTHR, [...DEFAULT_LTHR_PERCENTS], MAX_HR);
const BIRTHDAY = '1995-02';

function chart(hrs: number[], dt = 10): { hr: number[]; t: number[] } {
  const t = hrs.map((_, i) => i * dt);
  return { hr: hrs, t };
}

function estimatedFit(overrides: Partial<ZoneInfo> = {}): ZoneInfo {
  return {
    seconds: [40, 80, 60, 30, 20, 10],
    high_boundary: [90, 108, 126, 144, 162, 180],
    calc_type: 'percent_max_hr_estimated',
    max_hr: 180,
    ...overrides,
  };
}

function deviceFit(overrides: Partial<ZoneInfo> = {}): ZoneInfo {
  return {
    seconds: [20, 40, 50, 30, 25, 15, 5],
    high_boundary: [...SITE],
    calc_type: 'percent_lthr',
    threshold_hr: LTHR,
    max_hr: MAX_HR,
    ...overrides,
  };
}

function ageHighs(activityDate: string): number[] {
  const maxHr = estimatedMaxHrFromBirthday(BIRTHDAY, activityDate);
  assert.ok(maxHr);
  return DEFAULT_MAXHR_PERCENTS.map((p) => Math.round((maxHr * p) / 100));
}

describe('lthrHighBounds', () => {
  it('uses 176×107% rounded to 188 without a max-HR cap', () => {
    assert.deepEqual(
      lthrHighBounds(LTHR, [...DEFAULT_LTHR_PERCENTS], null),
      [114, 141, 157, 167, 176, 188]
    );
  });

  it('caps Z5 at VITE_MAX_HR / override instead of the rounded percent', () => {
    assert.deepEqual(SITE, [114, 141, 157, 167, 176, 189]);
  });
});

describe('ageOnActivityDate', () => {
  it('uses the activity date, not today, and increments on the birth month day 1', () => {
    // Birthday treated as 1995-02-01. 2024-01-31 is still 28; 2024-02-01 is 29.
    assert.equal(ageOnActivityDate(BIRTHDAY, '2024-01-31 08:00:00'), 28);
    assert.equal(ageOnActivityDate(BIRTHDAY, '2024-02-01'), 29);
    assert.equal(estimatedMaxHrFromAge(28), 192);
    assert.equal(estimatedMaxHrFromBirthday(BIRTHDAY, '2024-01-31'), 192);
    assert.equal(estimatedMaxHrFromBirthday(BIRTHDAY, '2024-02-01'), 191);
  });
});

describe('hrZonesFromChart', () => {
  it('bins by high bounds and uses the same dt rules as pace zones', () => {
    // 40s at 100, 40s at 150, 40s at 180.
    const hr = [100, 100, 100, 100, 150, 150, 150, 150, 180, 180, 180, 180];
    const t = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
    const secs = hrZonesFromChart(hr, t, SITE);
    assert.ok(secs);
    assert.equal(secs.length, SITE.length + 1);
    assert.equal(secs[0], 40); // ≤114
    assert.equal(secs[2], 40); // 141–157
    assert.equal(secs[5], 40); // 176–189
    assert.equal(
      secs.reduce((a, b) => a + b, 0),
      120
    );

    const withGap = hrZonesFromChart([...hr, 120], [...t, 310], SITE);
    assert.ok(withGap);
    // 200s gap after the last 180 sample is skipped, so that sample is dropped.
    assert.equal(
      withGap.reduce((a, b) => a + b, 0),
      110
    );
  });

  it('returns null when there is not enough usable duration', () => {
    assert.equal(hrZonesFromChart([100, 120], [0, 10], SITE), null);
  });
});

describe('resolveHrZones', () => {
  const analysis = {
    method: 'percent_lthr' as const,
    prefer: 'auto' as const,
  };

  it('reads method from config (not only the hr_method typo)', () => {
    const { hr, t } = chart(Array(8).fill(100));
    const resolved = resolveHrZones({
      fit: estimatedFit(),
      analysis,
      configLthr: LTHR,
      maxHr: MAX_HR,
      hr,
      t,
    });
    assert.equal(resolved.source, 'lthr');
    assert.deepEqual(resolved.zone?.high_boundary, SITE);
  });

  it('rebins percent_max_hr_estimated onto the site LTHR table', () => {
    const { hr, t } = chart([
      100, 100, 100, 100, 150, 150, 150, 150, 180, 180, 180, 180,
    ]);
    const resolved = resolveHrZones({
      fit: estimatedFit(),
      analysis,
      configLthr: LTHR,
      maxHr: MAX_HR,
      hr,
      t,
    });
    assert.equal(resolved.estimated, false);
    assert.equal(resolved.source, 'lthr');
    assert.equal(resolved.zone?.calc_type, 'percent_lthr');
    assert.deepEqual(resolved.zone?.high_boundary, SITE);
    assert.notDeepEqual(resolved.zone?.seconds, estimatedFit().seconds);
    assert.ok(resolved.zone?.seconds.some((s) => s > 0));
  });

  it('keeps a real device zone as source device, not overwritten by LTHR or age', () => {
    const resolved = resolveHrZones({
      fit: deviceFit(),
      analysis,
      configLthr: LTHR,
      maxHr: MAX_HR,
      birthdayMonth: BIRTHDAY,
      activityDate: '2024-06-15',
    });
    assert.equal(resolved.source, 'device');
    assert.equal(resolved.estimated, false);
    assert.deepEqual(resolved.zone?.seconds, deviceFit().seconds);
    assert.deepEqual(resolved.zone?.high_boundary, SITE);
  });

  it('rebins a device zone when bounds do not match the site table', () => {
    const { hr, t } = chart([
      100, 100, 100, 100, 150, 150, 150, 150, 180, 180, 180, 180,
    ]);
    const resolved = resolveHrZones({
      fit: deviceFit({
        high_boundary: [120, 140, 160, 175, 185, 200],
        threshold_hr: 170,
      }),
      analysis,
      configLthr: LTHR,
      maxHr: MAX_HR,
      hr,
      t,
    });
    assert.equal(resolved.source, 'lthr');
    assert.deepEqual(resolved.zone?.high_boundary, SITE);
    assert.notDeepEqual(resolved.zone?.seconds, deviceFit().seconds);
  });

  it('does not paste old seconds onto new LTHR bounds when there is no series', () => {
    const resolved = resolveHrZones({
      fit: estimatedFit(),
      analysis,
      configLthr: LTHR,
      maxHr: MAX_HR,
    });
    assert.equal(resolved.source, 'none');
    assert.equal(resolved.emptyReason, 'no_hr_data');
    assert.equal(resolved.zone, null);
  });

  it('defaults to keeping a mismatched device zone (prefer:device)', () => {
    const device = deviceFit({
      high_boundary: [120, 140, 160, 175, 185, 200],
      threshold_hr: 170,
    });
    const resolved = resolveHrZones({
      fit: device,
      analysis: { method: 'percent_lthr' },
      configLthr: LTHR,
      maxHr: MAX_HR,
      birthdayMonth: BIRTHDAY,
      activityDate: '2024-06-15',
      ...chart(Array(8).fill(150)),
    });
    assert.equal(resolved.source, 'device');
    assert.equal(resolved.estimated, false);
    assert.deepEqual(resolved.zone?.high_boundary, device.high_boundary);
    assert.deepEqual(resolved.zone?.seconds, device.seconds);
  });

  it('keeps a real device zone under prefer:device even if bounds differ', () => {
    const device = deviceFit({
      high_boundary: [120, 140, 160, 175, 185, 200],
      threshold_hr: 170,
    });
    const resolved = resolveHrZones({
      fit: device,
      analysis: { method: 'percent_lthr', prefer: 'device' },
      configLthr: LTHR,
      maxHr: MAX_HR,
      ...chart(Array(8).fill(150)),
    });
    assert.equal(resolved.source, 'device');
    assert.equal(resolved.estimated, false);
    assert.deepEqual(resolved.zone?.high_boundary, device.high_boundary);
    assert.deepEqual(resolved.zone?.seconds, device.seconds);
  });

  it('still rebins estimates under prefer:device when LTHR is set', () => {
    const { hr, t } = chart(Array(8).fill(100));
    const resolved = resolveHrZones({
      fit: estimatedFit(),
      analysis: { method: 'percent_lthr', prefer: 'device' },
      configLthr: LTHR,
      maxHr: MAX_HR,
      hr,
      t,
    });
    assert.equal(resolved.source, 'lthr');
    assert.deepEqual(resolved.zone?.high_boundary, SITE);
  });

  it('always rebins under prefer:lthr when a series exists', () => {
    const { hr, t } = chart(Array(8).fill(130));
    const resolved = resolveHrZones({
      fit: deviceFit(),
      analysis: { method: 'percent_lthr', prefer: 'lthr' },
      configLthr: LTHR,
      maxHr: MAX_HR,
      hr,
      t,
    });
    assert.equal(resolved.source, 'lthr');
    assert.notDeepEqual(resolved.zone?.seconds, deviceFit().seconds);
  });

  it('shows a real device zone as not estimated when no LTHR is set', () => {
    // Without env/config LTHR, a device file's threshold_hr would still be
    // treated as LTHR. Drop it so this case is truly 'no personal LTHR'.
    const fit = deviceFit({ threshold_hr: null });
    const resolved = resolveHrZones({
      fit,
      analysis,
      birthdayMonth: BIRTHDAY,
      activityDate: '2024-06-15',
    });
    assert.equal(resolved.source, 'device');
    assert.equal(resolved.estimated, false);
    assert.deepEqual(resolved.zone?.high_boundary, fit.high_boundary);
    assert.deepEqual(resolved.zone?.seconds, fit.seconds);
  });

  it('does not treat percent_max_hr_estimated as a device zone; rebins with LTHR', () => {
    const { hr, t } = chart(Array(8).fill(130));
    const resolved = resolveHrZones({
      fit: estimatedFit(),
      analysis: { method: 'percent_lthr', prefer: 'device' },
      configLthr: LTHR,
      hr,
      t,
    });
    assert.equal(isDeviceHrZone(estimatedFit()), false);
    assert.equal(resolved.source, 'lthr');
    assert.notDeepEqual(resolved.zone?.seconds, estimatedFit().seconds);
  });

  it('uses 220−age when there is no device zone and no LTHR', () => {
    const activityDate = '2024-06-15';
    const highs = ageHighs(activityDate);
    const { hr, t } = chart(Array(8).fill(130));
    const resolved = resolveHrZones({
      fit: estimatedFit(),
      analysis,
      maxHr: MAX_HR,
      birthdayMonth: BIRTHDAY,
      activityDate,
      hr,
      t,
    });
    assert.equal(resolved.source, 'maxhr_age');
    assert.equal(resolved.estimated, true);
    assert.equal(resolved.zone?.calc_type, 'percent_max_hr_age_estimated');
    assert.deepEqual(resolved.zone?.high_boundary, highs);
    assert.equal(resolved.zone?.max_hr, 191);
    assert.notEqual(resolved.zone?.max_hr, 180);
    assert.notDeepEqual(resolved.zone?.seconds, estimatedFit().seconds);
  });

  it('does not lift an easy aerobic run into high zones via peak HR', () => {
    // 80s around 130–140 bpm. Peak-as-100% would put this near the top;
    // 220−age (~191) should keep it in the easy/moderate bands.
    const activityDate = '2024-06-15';
    const highs = ageHighs(activityDate);
    const { hr, t } = chart([130, 132, 135, 138, 140, 138, 135, 132]);
    const resolved = resolveHrZones({
      fit: estimatedFit({ max_hr: 140 }),
      analysis,
      birthdayMonth: BIRTHDAY,
      activityDate,
      hr,
      t,
    });
    assert.equal(resolved.source, 'maxhr_age');
    const secs = resolved.zone?.seconds ?? [];
    const hard = secs.slice(4).reduce((a, b) => a + b, 0);
    assert.equal(hard, 0);
    assert.ok((secs[2] ?? 0) + (secs[3] ?? 0) > 0);
    // 140 is below the 80% bound (round(191*0.8)=153), so not Z4+.
    assert.ok(highs[3] > 140);
  });

  it('returns none with no all-zero chart when there is no baseline', () => {
    const { hr, t } = chart(Array(8).fill(130));
    const resolved = resolveHrZones({
      fit: estimatedFit(),
      analysis,
      maxHr: MAX_HR,
      hr,
      t,
    });
    assert.equal(resolved.source, 'none');
    assert.equal(resolved.emptyReason, 'no_baseline');
    assert.equal(resolved.zone, null);
  });

  it('returns a no-data empty state when a baseline exists but the series is missing', () => {
    const withoutLthr = resolveHrZones({
      fit: estimatedFit(),
      analysis,
      birthdayMonth: BIRTHDAY,
      activityDate: '2024-06-15',
      maxHr: MAX_HR,
    });
    assert.equal(withoutLthr.source, 'none');
    assert.equal(withoutLthr.emptyReason, 'no_hr_data');
    assert.equal(withoutLthr.zone, null);

    const withLthr = resolveHrZones({
      analysis,
      configLthr: LTHR,
      birthdayMonth: BIRTHDAY,
      activityDate: '2024-06-15',
    });
    assert.equal(withLthr.source, 'none');
    assert.equal(withLthr.emptyReason, 'no_hr_data');
  });

  it('keeps source lthr when VITE_MAX_HR only changes the Z5 high bound', () => {
    const { hr, t } = chart(Array(8).fill(180));
    const resolved = resolveHrZones({
      fit: estimatedFit(),
      analysis,
      configLthr: LTHR,
      maxHr: MAX_HR,
      hr,
      t,
    });
    const uncapped = lthrHighBounds(LTHR, [...DEFAULT_LTHR_PERCENTS], null);
    assert.equal(resolved.source, 'lthr');
    assert.deepEqual(resolved.zone?.high_boundary, SITE);
    assert.notEqual(resolved.zone?.high_boundary?.at(-1), uncapped.at(-1));
    assert.equal(resolved.zone?.high_boundary?.at(-1), MAX_HR);
  });

  it('skips VITE_MAX_HR when there is no LTHR and uses age instead', () => {
    const activityDate = '2024-06-15';
    const { hr, t } = chart(Array(8).fill(130));
    const resolved = resolveHrZones({
      analysis,
      maxHr: MAX_HR,
      birthdayMonth: BIRTHDAY,
      activityDate,
      hr,
      t,
    });
    assert.equal(resolved.source, 'maxhr_age');
    assert.deepEqual(resolved.zone?.high_boundary, ageHighs(activityDate));
    assert.notEqual(resolved.zone?.max_hr, MAX_HR);
  });

  it('does not use today when the activity date crosses a birthday', () => {
    const jan = resolveHrZones({
      analysis,
      birthdayMonth: BIRTHDAY,
      activityDate: '2024-01-31',
      ...chart(Array(8).fill(130)),
    });
    const feb = resolveHrZones({
      analysis,
      birthdayMonth: BIRTHDAY,
      activityDate: '2024-02-01',
      ...chart(Array(8).fill(130)),
    });
    assert.equal(jan.source, 'maxhr_age');
    assert.equal(feb.source, 'maxhr_age');
    assert.equal(jan.zone?.max_hr, 192);
    assert.equal(feb.zone?.max_hr, 191);
    assert.notDeepEqual(jan.zone?.high_boundary, feb.zone?.high_boundary);
  });
});

describe('isDeviceHrZone / bounds match', () => {
  it('does not treat percent_max_hr_estimated as a device zone', () => {
    assert.equal(isDeviceHrZone(estimatedFit()), false);
    assert.equal(isDeviceHrZone(deviceFit()), true);
  });

  it('requires the same length and 1 bpm tolerance', () => {
    assert.equal(hrZoneBoundsMatch(SITE, SITE, LTHR, LTHR), true);
    assert.equal(hrZoneBoundsMatch([114, 141, 157, 167, 176], SITE), false);
    assert.equal(
      hrZoneBoundsMatch([114, 141, 157, 167, 176, 190], SITE, LTHR, LTHR),
      true
    );
    assert.equal(hrZoneBoundsMatch(SITE, SITE, 170, LTHR), false);
  });
});
