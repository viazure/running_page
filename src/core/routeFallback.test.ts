import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeForActivity } from './routeFallback.ts';

describe('routeForActivity', () => {
  const older = {
    start_date_local: '2026-11-16 18:00:00',
    summary_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    has_gps: true,
  };
  const selectedLite = {
    start_date_local: '2026-11-19 07:00:00',
    summary_polyline: null as string | null,
    has_gps: true,
  };

  it('does not fall back when lite selected has has_gps', () => {
    const result = routeForActivity(selectedLite, [older, selectedLite]);
    assert.equal(result, selectedLite);
  });

  it('falls back to an earlier mapped run when has_gps is false', () => {
    const indoor = {
      start_date_local: '2026-11-19 07:00:00',
      summary_polyline: null as string | null,
      has_gps: false,
    };
    const result = routeForActivity(indoor, [older, indoor]);
    assert.equal(result, older);
  });
});
