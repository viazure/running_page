import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Activity } from '../../../core/types.ts';
import {
  buildActivitySummaryV1,
  buildLocalDaySlots,
  buildPaceBlocks,
  buildYearYtdCompare,
  daysInYear,
  filterL0,
  isLeapYear,
  weightedPaceSeconds,
} from './summaryAggregator.ts';

function act(
  partial: Partial<Activity> &
    Pick<Activity, 'run_id' | 'distance' | 'moving_time' | 'start_date_local'>
): Activity {
  return {
    name: '',
    type: 'Run',
    start_date: partial.start_date_local,
    location_country: null,
    summary_polyline: null,
    average_heartrate: null,
    average_speed: 0,
    elevation_gain: null,
    streak: 1,
    ...partial,
  };
}

describe('daysInYear / leap', () => {
  it('uses 366 slots for leap years', () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(daysInYear(2024), 366);
    assert.equal(daysInYear(2025), 365);
  });
});

describe('filterL0', () => {
  it('keeps Run with L0 fields and drops Ride', () => {
    const list = filterL0([
      act({
        run_id: 1,
        distance: 5000,
        moving_time: '0:25:00',
        start_date_local: '2024-01-02 08:00:00',
      }),
      act({
        run_id: 2,
        distance: 10000,
        moving_time: '0:40:00',
        start_date_local: '2024-01-03 08:00:00',
        type: 'Ride',
      }),
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0].run_id, 1);
  });
});

describe('weightedPaceSeconds', () => {
  it('uses Σtime/Σdistance, not arithmetic mean of per-run paces', () => {
    // 5km in 25:00 (300s/km) + 10km in 40:00 (240s/km)
    // arithmetic mean = 270; weighted = (1500+2400)/(5000+10000)*1000 = 260
    const pace = weightedPaceSeconds([
      act({
        run_id: 1,
        distance: 5000,
        moving_time: '0:25:00',
        start_date_local: '2024-03-01 08:00:00',
      }),
      act({
        run_id: 2,
        distance: 10000,
        moving_time: '0:40:00',
        start_date_local: '2024-03-02 08:00:00',
      }),
    ]);
    assert.ok(pace != null);
    assert.equal(Math.round(pace!), 260);
  });

  it('excludes distance<=0 or moving_time<=0 from pace set', () => {
    const pace = weightedPaceSeconds([
      act({
        run_id: 1,
        distance: 0,
        moving_time: '0:25:00',
        start_date_local: '2024-03-01 08:00:00',
      }),
      act({
        run_id: 2,
        distance: 5000,
        moving_time: '0:00:00',
        start_date_local: '2024-03-02 08:00:00',
      }),
      act({
        run_id: 3,
        distance: 5000,
        moving_time: '0:25:00',
        start_date_local: '2024-03-03 08:00:00',
      }),
    ]);
    assert.equal(Math.round(pace!), 300);
  });
});

describe('buildLocalDaySlots coverage', () => {
  it('leap year returns 366 slots', () => {
    const slots = buildLocalDaySlots(
      2024,
      [
        act({
          run_id: 1,
          distance: 5000,
          moving_time: '0:25:00',
          start_date_local: '2024-02-29 08:00:00',
        }),
      ],
      {
        asOf: '2024-12-31',
        firstCovered: '2024-02-29',
        lastCovered: '2024-02-29',
      }
    );
    assert.equal(slots.length, 366);
    const feb29 = slots.find((s) => s.date === '2024-02-29');
    assert.equal(feb29?.km, 5);
    // Before first covered → null (no fake 0)
    const jan1 = slots.find((s) => s.date === '2024-01-01');
    assert.equal(jan1?.km, null);
  });

  it('does not fill unknown gaps with 0 km', () => {
    const slots = buildLocalDaySlots(2023, [], {
      asOf: '2023-12-31',
    });
    assert.ok(slots.every((s) => s.km === null));
  });
});

describe('buildYearYtdCompare', () => {
  it('cuts both years at the same MM-DD', () => {
    const acts = [
      act({
        run_id: 1,
        distance: 5000,
        moving_time: '0:25:00',
        start_date_local: '2025-01-10 08:00:00',
      }),
      act({
        run_id: 2,
        distance: 5000,
        moving_time: '0:25:00',
        start_date_local: '2025-06-01 08:00:00',
      }),
      act({
        run_id: 3,
        distance: 10000,
        moving_time: '0:50:00',
        start_date_local: '2026-01-15 08:00:00',
      }),
      act({
        run_id: 4,
        distance: 10000,
        moving_time: '0:50:00',
        start_date_local: '2026-07-01 08:00:00',
      }),
    ];
    const cmp = buildYearYtdCompare(acts, 2026, '2026-06-15');
    assert.equal(cmp.ytdEnd, '06-15');
    assert.equal(cmp.current.runCount, 1);
    assert.equal(cmp.current.distanceM, 10000);
    assert.equal(cmp.prior.runCount, 2);
    assert.equal(cmp.prior.distanceM, 10000);
  });
});

describe('paceBlocks insufficient_sample', () => {
  it('marks n<3 as insufficient_sample', () => {
    const blocks = buildPaceBlocks([
      act({
        run_id: 1,
        distance: 5000,
        moving_time: '0:25:00',
        start_date_local: '2024-01-01 08:00:00',
      }),
      act({
        run_id: 2,
        distance: 5100,
        moving_time: '0:26:00',
        start_date_local: '2024-01-02 08:00:00',
      }),
    ]);
    const five = blocks.find((b) => b.id === '5k');
    assert.equal(five?.n, 2);
    assert.equal(five?.insufficient_sample, true);
  });
});

describe('buildActivitySummaryV1', () => {
  it('marks ended_year_imported when year does not start Jan 1', () => {
    const v1 = buildActivitySummaryV1(
      [
        act({
          run_id: 1,
          distance: 5000,
          moving_time: '0:25:00',
          start_date_local: '2022-05-01 08:00:00',
        }),
      ],
      { year: 2022, asOf: '2026-11-09' }
    );
    assert.equal(v1.endedYearImported, true);
    assert.equal(v1.coverage, 'partial');
  });

  it('omits HR when missing without blocking totals', () => {
    const v1 = buildActivitySummaryV1(
      [
        act({
          run_id: 1,
          distance: 5000,
          moving_time: '0:25:00',
          start_date_local: '2025-01-01 08:00:00',
          average_heartrate: null,
        }),
      ],
      { year: 2025, asOf: '2025-12-31' }
    );
    assert.equal(v1.heartRateAvg, null);
    assert.equal(v1.totals.runCount, 1);
    assert.equal(v1.totals.distanceM, 5000);
  });
});
