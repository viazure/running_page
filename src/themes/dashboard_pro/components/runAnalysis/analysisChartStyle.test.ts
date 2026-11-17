import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANALYSIS_AREA_FILL,
  ANALYSIS_AREA_STROKE_WIDTH,
  ANALYSIS_COMPARE_AREA_FILL,
  ANALYSIS_DYNAMICS_BAND_OPACITY,
  ANALYSIS_FORM_DOT_CLASS,
  ANALYSIS_FORM_DOT_OPACITY,
  ANALYSIS_FORM_DOT_SIZE_CLASS,
  ANALYSIS_FORM_DOT_SIZE_PX,
  ANALYSIS_LINE_STROKE_WIDTH,
  ANALYSIS_OVERFLOW_BUTTON_CLASS,
  ANALYSIS_SELECTOR_CLASS,
  applyCompareMetricChange,
  applyOverlayDrawingSwap,
  ANALYSIS_SERIES_COLORS,
  areaFillOpacities,
  chartAreaFills,
  compareSeriesDrawing,
  isCompareOptionDisabled,
  seriesStrokeWidth,
  usesHrZoneStroke,
  type CompareSelection,
} from './analysisChartStyle.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('analysis chart style tokens', () => {
  it('fills area mode 0.52 at the data edge to 0.28 at the baseline', () => {
    assert.equal(ANALYSIS_AREA_FILL.top, 0.52);
    assert.equal(ANALYSIS_AREA_FILL.bottom, 0.28);
    assert.deepEqual(areaFillOpacities(false), ANALYSIS_AREA_FILL);
  });

  it('uses a lighter 0.22 to 0.12 vertical fill in compare, still heavier at the top', () => {
    assert.equal(ANALYSIS_COMPARE_AREA_FILL.top, 0.22);
    assert.equal(ANALYSIS_COMPARE_AREA_FILL.bottom, 0.12);
    assert.deepEqual(areaFillOpacities(true), ANALYSIS_COMPARE_AREA_FILL);
    assert.ok(ANALYSIS_COMPARE_AREA_FILL.top < ANALYSIS_AREA_FILL.top);
    assert.ok(ANALYSIS_COMPARE_AREA_FILL.bottom < ANALYSIS_AREA_FILL.bottom);
  });

  it('uses a 2.5px solid top edge on area series and keeps 2.25px for pure lines', () => {
    assert.equal(ANALYSIS_LINE_STROKE_WIDTH, 2.25);
    assert.equal(ANALYSIS_AREA_STROKE_WIDTH, 2.5);
    assert.equal(seriesStrokeWidth(false), ANALYSIS_LINE_STROKE_WIDTH);
    assert.equal(seriesStrokeWidth(true), ANALYSIS_AREA_STROKE_WIDTH);
  });

  it('restores original pace and power colors, leaving the muted HR red', () => {
    assert.equal(ANALYSIS_SERIES_COLORS.pace, '#3b82f6');
    assert.equal(ANALYSIS_SERIES_COLORS.power, '#a855f7');
    assert.equal(ANALYSIS_SERIES_COLORS.hr, '#C36B66');
  });

  it('fades form-chart background bands into the 3.5%–6% range', () => {
    assert.ok(ANALYSIS_DYNAMICS_BAND_OPACITY >= 0.035);
    assert.ok(ANALYSIS_DYNAMICS_BAND_OPACITY <= 0.06);
  });

  it('makes form-chart dots 5px and slightly softer than the original page, still clearly visible', () => {
    assert.equal(ANALYSIS_FORM_DOT_SIZE_PX, 5);
    assert.equal(ANALYSIS_FORM_DOT_SIZE_CLASS, 'size-[5px]');
    assert.equal(ANALYSIS_FORM_DOT_OPACITY, 0.68);
    assert.match(ANALYSIS_FORM_DOT_CLASS, /size-\[5px\]/);
    assert.doesNotMatch(ANALYSIS_FORM_DOT_CLASS, /\bsize-1(?!\.\d)\b/);
    assert.doesNotMatch(ANALYSIS_FORM_DOT_CLASS, /\bsize-1\.5\b/);
    assert.doesNotMatch(ANALYSIS_FORM_DOT_CLASS, /\bsize-0\.5\b/);
    assert.ok(ANALYSIS_FORM_DOT_OPACITY >= 0.6);
    assert.ok(ANALYSIS_FORM_DOT_OPACITY < 0.92);
  });

  it('gives compare selectors a 44px phone target and a flat desktop capsule', () => {
    for (const cls of [
      ANALYSIS_SELECTOR_CLASS,
      ANALYSIS_OVERFLOW_BUTTON_CLASS,
    ]) {
      assert.match(cls, /\bmin-h-11\b/);
      assert.match(cls, /\bmd:min-h-0\b/);
    }
  });
});

describe('compare selectors', () => {
  const start: CompareSelection = {
    primaryKey: 'hr',
    overlayKey: 'power',
    overlayIsArea: true,
  };

  it('keeps a distinct primary metric and rejects the overlay key', () => {
    assert.equal(isCompareOptionDisabled('primary', 'power', start), true);
    assert.equal(isCompareOptionDisabled('primary', 'hr', start), false);
    assert.deepEqual(
      applyCompareMetricChange(start, 'primary', 'power'),
      start
    );
    assert.deepEqual(applyCompareMetricChange(start, 'primary', 'pace'), {
      primaryKey: 'pace',
      overlayKey: 'power',
      overlayIsArea: false,
    });
  });

  it('lets the overlay change independently of the primary key', () => {
    assert.equal(isCompareOptionDisabled('overlay', 'hr', start), true);
    assert.equal(isCompareOptionDisabled('overlay', 'cad', start), false);
    assert.deepEqual(applyCompareMetricChange(start, 'overlay', 'hr'), start);
    assert.deepEqual(applyCompareMetricChange(start, 'overlay', 'cad'), {
      primaryKey: 'hr',
      overlayKey: 'cad',
      overlayIsArea: false,
    });
  });
});

describe('chart area fills', () => {
  it('keeps a single HR/area chart on the single-area fill, never also painting the compare fill', () => {
    const single = chartAreaFills(false);
    assert.equal(single.useComparePrimaryArea, false);
    assert.equal(single.useCompareOverlayArea, false);
    assert.equal(single.useSingleArea, true);

    const compare = chartAreaFills(true);
    assert.equal(compare.useComparePrimaryArea, true);
    assert.equal(compare.useCompareOverlayArea, true);
    assert.equal(compare.useSingleArea, false);
  });
});

describe('compare area outline', () => {
  it('keeps a line on the area series so HR does not lose its border', () => {
    const hrAsArea = compareSeriesDrawing(false);
    assert.equal(hrAsArea.primaryHasArea, true);
    assert.equal(hrAsArea.primaryHasLine, true);
    assert.equal(hrAsArea.overlayHasArea, false);
    assert.equal(hrAsArea.overlayHasLine, true);

    const hrAsLine = compareSeriesDrawing(true);
    assert.equal(hrAsLine.primaryHasArea, false);
    assert.equal(hrAsLine.primaryHasLine, true);
    assert.equal(hrAsLine.overlayHasArea, true);
    assert.equal(hrAsLine.overlayHasLine, true);
  });
});

describe('swap-menu 对调面积/折线', () => {
  it('toggles drawing roles without swapping primary and overlay metrics', () => {
    const start: CompareSelection = {
      primaryKey: 'hr',
      overlayKey: 'power',
      overlayIsArea: false,
    };
    const swapped = applyOverlayDrawingSwap(start);
    assert.deepEqual(swapped, {
      primaryKey: 'hr',
      overlayKey: 'power',
      overlayIsArea: true,
    });
    assert.deepEqual(applyOverlayDrawingSwap(swapped), start);
  });
});

describe('area and zone-line wiring in AnalysisCharts', () => {
  const src = readFileSync(join(here, 'AnalysisCharts.tsx'), 'utf8');

  it('paints area fills with the vertical gradient tokens, not a flat 3% or 16% wash', () => {
    assert.match(src, /areaFillOpacities\(/);
    assert.match(src, /linearGradient/);
    assert.match(src, /stopOpacity/);
    assert.doesNotMatch(src, /ANALYSIS_AREA_FILL_OPACITY/);
    assert.doesNotMatch(src, /ANALYSIS_COMPARE_AREA_FILL_OPACITY/);
    assert.doesNotMatch(src, /opacity=\{ANALYSIS_AREA_FILL/);
  });

  it('strokes the area top edge at 2.5px and leaves pure or zone lines at 2.25px', () => {
    assert.match(src, /seriesStrokeWidth\(/);
    assert.match(src, /ANALYSIS_LINE_STROKE_WIDTH/);
    assert.doesNotMatch(src, /compareLineStrokeWidth/);
    assert.doesNotMatch(src, /ANALYSIS_OVERLAY_LINE_STROKE_WIDTH/);
  });

  it('does not color HR area by zone; zone strokes are only for zone-line mode', () => {
    assert.equal(usesHrZoneStroke('fill', false), false);
    assert.equal(usesHrZoneStroke('fill', true), false);
    assert.equal(usesHrZoneStroke('zones', true), false);
    assert.equal(usesHrZoneStroke('zones', false), true);
    assert.match(src, /usesHrZoneStroke\(/);
  });
});
