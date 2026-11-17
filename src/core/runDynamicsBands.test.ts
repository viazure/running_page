import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CADENCE_Y_DOMAIN,
  DYNAMICS_BANDS,
  DYNAMICS_BAND_PERCENTILE_LABELS,
  cadenceYDomain,
  cadenceZoneNameAndRange,
  strideYDomain,
  dynamicsBandExtent,
  dynamicsLegendRange,
  dynamicsPercentileNames,
  dynamicsScatterDomain,
  scatterMetricDomain,
} from './runDynamicsBands.ts';

const chartsSrc = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../themes/dashboard_pro/components/runAnalysis/AnalysisCharts.tsx'
  ),
  'utf8'
);

describe('dynamics percentile labels', () => {
  it('uses percentile names, not qualitative grades, in both languages', () => {
    assert.deepEqual(
      DYNAMICS_BAND_PERCENTILE_LABELS.map((r) => r.zh),
      ['优于约 95%', '70%–95%', '30%–69%', '5%–29%', '不到 5%']
    );
    assert.deepEqual(
      DYNAMICS_BAND_PERCENTILE_LABELS.map((r) => r.en),
      ['Better than ~95%', '70%–95%', '30%–69%', '5%–29%', 'Below 5%']
    );
    const blob = JSON.stringify(DYNAMICS_BAND_PERCENTILE_LABELS);
    for (const banned of [
      '很好',
      '较好',
      '中等',
      '偏弱',
      '较弱',
      'Excellent',
      'Poor',
    ]) {
      assert.doesNotMatch(blob, new RegExp(banned));
    }
    const names = dynamicsPercentileNames((zh) => zh);
    assert.equal(names[0], '优于约 95%');
    assert.equal(names[4], '不到 5%');
  });

  it('uses the same percentile main names for the cadence zone table', () => {
    const rows = cadenceZoneNameAndRange((zh) => zh);
    assert.deepEqual(
      rows.map((r) => r.name),
      DYNAMICS_BAND_PERCENTILE_LABELS.map((r) => r.zh)
    );
    assert.deepEqual(
      rows.map((r) => r.range),
      ['>185', '174–185', '163–173', '151–162', '<151']
    );
    for (const row of rows) {
      assert.doesNotMatch(row.name, /很好|较好|中等|偏弱|较弱/);
    }
  });

  it('puts the numeric range beside the percentile, with units on the chart legend', () => {
    assert.equal(dynamicsLegendRange('gct', '<208', 'ms'), '<208 ms');
    assert.equal(dynamicsLegendRange('vo', '<6.4', 'cm'), '<6.4 cm');
    assert.equal(dynamicsLegendRange('vr', '<6.1', '%'), '<6.1%');
    assert.equal(dynamicsLegendRange('cadence', '>185', 'spm'), '>185 spm');
  });
});

describe('VO / VR / GCT y-domain is five bands ∪ extrema', () => {
  const mid = {
    vo: [7.2, 7.5, 8.0, 8.2],
    vr: [7.0, 7.2, 7.8, 8.0],
    gct: [230, 235, 240, 250],
  } as const;

  for (const metric of ['vo', 'vr', 'gct'] as const) {
    it(`${metric} keeps all five bands visible when samples sit in the middle`, () => {
      const cuts = DYNAMICS_BANDS[metric];
      const [lo, hi] = dynamicsScatterDomain(metric, [...mid[metric]]);
      const [bandLo, bandHi] = dynamicsBandExtent(metric);
      assert.ok(
        lo <= cuts[0],
        `${metric} lo ${lo} should be below first cut ${cuts[0]}`
      );
      assert.ok(
        hi >= cuts[cuts.length - 1],
        `${metric} hi ${hi} should be above last cut`
      );
      assert.ok(lo <= bandLo + 1e-9);
      assert.ok(hi >= bandHi - 1e-9);
    });

    it(`${metric} expands past the five bands when data is higher or lower`, () => {
      const cuts = DYNAMICS_BANDS[metric];
      const low = cuts[0] - 20;
      const high = cuts[cuts.length - 1] + 20;
      const [lo, hi] = dynamicsScatterDomain(metric, [low, high]);
      assert.ok(lo < low, `${metric} should pad outside the low extreme`);
      assert.ok(hi > high, `${metric} should pad outside the high extreme`);
    });

    it(`${metric} still shows all five bands when values collapse`, () => {
      const cuts = DYNAMICS_BANDS[metric];
      const midCut = (cuts[1] + cuts[2]) / 2;
      const [lo, hi] = dynamicsScatterDomain(
        metric,
        [midCut, midCut, midCut],
        midCut
      );
      assert.ok(lo < cuts[0]);
      assert.ok(hi > cuts[cuts.length - 1]);
    });
  }
});

describe('cadence and stride scatter domains', () => {
  it('keeps cadence at the 90–190 base window when samples sit inside', () => {
    assert.deepEqual(CADENCE_Y_DOMAIN, [90, 190]);
    assert.deepEqual(
      scatterMetricDomain('cad', [160, 165, 170], 164),
      [90, 190]
    );
    assert.deepEqual(cadenceYDomain([174, 180, 185]), [90, 190]);
  });

  it('expands cadence beyond 90–190 when a run goes outside, without shrinking', () => {
    const [lo, hi] = scatterMetricDomain('cad', [80, 210], 150);
    assert.ok(lo < 80, `lo ${lo} should pad below the low extreme`);
    assert.ok(hi > 210, `hi ${hi} should pad above the high extreme`);
    assert.ok(lo < 90);
    assert.ok(hi > 190);
    const [midLo, midHi] = cadenceYDomain([160, 165, 170]);
    assert.deepEqual([midLo, midHi], [90, 190]);
    const [lowLo, lowHi] = cadenceYDomain([85, 170]);
    assert.ok(lowLo < 85);
    assert.equal(lowHi, 190);
    const [highLo, highHi] = cadenceYDomain([160, 205]);
    assert.equal(highLo, 90);
    assert.ok(highHi > 205);
  });

  it('sets stride from 0 to a nice tick above max + pad, not 0.6–1.1 or a fixed 0–2.0', () => {
    const [loMid, hiMid] = scatterMetricDomain('stride', [0.85, 0.9], 0.88);
    assert.equal(loMid, 0);
    assert.ok(hiMid > 0.9);
    assert.ok(
      hiMid < 2.0,
      `bunched mid stride should not jump to 2.0, got ${hiMid}`
    );
    assert.ok(Math.abs(hiMid * 10 - Math.round(hiMid * 10)) < 1e-9);

    const [loHi, hiHi] = scatterMetricDomain('stride', [0.4, 1.4], 1.0);
    assert.equal(loHi, 0);
    assert.ok(
      hiHi >= 1.5 && hiHi <= 1.6,
      `1.40-ish max should nice-ceil to 1.5 or 1.6, got ${hiHi}`
    );
    assert.ok(hiHi > 1.4, 'max must not sit on the axis or be clamped to 1.1');
    assert.notDeepEqual([loHi, hiHi], [0.6, 1.1]);
    assert.notDeepEqual([loHi, hiHi], [0, 2.0]);

    const [loShort, hiShort] = strideYDomain([1.05]);
    assert.equal(loShort, 0);
    assert.ok(hiShort > 1.05);
    assert.ok(
      hiShort < 2.0,
      `no tall points should not fix 0–2.0, got ${hiShort}`
    );

    const [loTall, hiTall] = strideYDomain([1.95]);
    assert.equal(loTall, 0);
    assert.ok(
      hiTall >= 2.0,
      `near-2 m points should lift the top to 2.0 or a bit higher, got ${hiTall}`
    );
    assert.ok(hiTall > 1.95);
  });

  it('routes VO/VR/GCT through the five-band ∪ extrema domain', () => {
    const [bandLo, bandHi] = dynamicsBandExtent('gct');
    const [lo, hi] = scatterMetricDomain('gct', [230, 240], 235);
    assert.ok(lo <= bandLo);
    assert.ok(hi >= bandHi);
    const [hiLo, hiHi] = scatterMetricDomain('gct', [180, 360]);
    assert.ok(hiLo < 180);
    assert.ok(hiHi > 360);
    assert.ok(hiLo < DYNAMICS_BANDS.gct[0]);
    assert.ok(hiHi > DYNAMICS_BANDS.gct[3]);
  });

  it('calls scatterMetricDomain for scatter series in the charts', () => {
    assert.match(chartsSrc, /scatterMetricDomain\(def\.key/);
    assert.match(chartsSrc, /scatterMetricDomain\(overlay\.key/);
    assert.doesNotMatch(chartsSrc, /scatterDomain\(/);
  });
});
