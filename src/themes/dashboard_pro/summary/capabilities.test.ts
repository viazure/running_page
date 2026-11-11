import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_CAPABILITIES,
  MIN_SAMPLES,
  capabilitiesFromActivities,
  gate,
  mergeCapabilities,
  type Capabilities,
} from './capabilities.ts';

describe('gate', () => {
  it('hides a block when the capability is absent (GPX-only site)', () => {
    assert.equal(gate(EMPTY_CAPABILITIES, 'trainingLoad'), 'hide');
    assert.equal(gate(null, 'hrZones'), 'hide');
  });

  it('reports insufficient below the sample threshold', () => {
    const caps: Capabilities = { ...EMPTY_CAPABILITIES, vo2max: 1 };
    assert.equal(gate(caps, 'vo2max'), 'insufficient');
  });

  it('shows once coverage meets the threshold', () => {
    const caps: Capabilities = { ...EMPTY_CAPABILITIES, vo2max: MIN_SAMPLES };
    assert.equal(gate(caps, 'vo2max'), 'show');
  });

  it('requires every capability in a composite need', () => {
    const caps: Capabilities = {
      ...EMPTY_CAPABILITIES,
      vo2max: 50,
      streams: 0,
    };
    assert.equal(gate(caps, ['vo2max', 'streams']), 'hide');
    assert.equal(gate({ ...caps, streams: 50 }, ['vo2max', 'streams']), 'show');
  });

  it('accepts one capability in any-mode (composite cards with independent series)', () => {
    // AerobicTrend draws VO2max / decoupling / cadence separately, so a deploy
    // with HR streams but no VO2max must still render the card.
    const onlyStreams: Capabilities = {
      ...EMPTY_CAPABILITIES,
      vo2max: 0,
      streams: 50,
    };
    assert.equal(gate(onlyStreams, ['vo2max', 'streams'], 'any'), 'show');
    assert.equal(
      gate({ ...EMPTY_CAPABILITIES, streams: 1 }, ['vo2max', 'streams'], 'any'),
      'insufficient'
    );
    assert.equal(
      gate(EMPTY_CAPABILITIES, ['vo2max', 'streams'], 'any'),
      'hide'
    );
  });
});

describe('capabilitiesFromActivities', () => {
  it('counts only activities that actually carry the field', () => {
    const caps = capabilitiesFromActivities([
      { average_heartrate: 148, elevation_gain: 20 },
      { average_heartrate: null, elevation_gain: null },
      { average_heartrate: 0, elevation_gain: 0 },
    ]);
    assert.equal(caps.hr, 1);
    // elevation_gain: 0 is a real value (flat run), null is missing.
    assert.equal(caps.elevation, 2);
  });

  it('leaves split-derived tiers at zero', () => {
    const caps = capabilitiesFromActivities([{ average_heartrate: 140 }]);
    assert.equal(caps.trainingLoad, 0);
    assert.equal(caps.streams, 0);
    assert.equal(caps.hrZones, 0);
  });
});

describe('mergeCapabilities', () => {
  it('takes the max of activity-level and split-level coverage', () => {
    const base: Capabilities = { ...EMPTY_CAPABILITIES, hr: 10, streams: 0 };
    const merged = mergeCapabilities(base, { hr: 4, streams: 12 });
    assert.equal(merged.hr, 10);
    assert.equal(merged.streams, 12);
  });

  it('returns the base when the aggregate payload is missing', () => {
    const base: Capabilities = { ...EMPTY_CAPABILITIES, hr: 7 };
    assert.deepEqual(mergeCapabilities(base, null), base);
  });
});
