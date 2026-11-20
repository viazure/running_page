import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { messages } from '../../../../core/i18n.ts';
import { METRIC_GLOSSARY } from '../../../../core/runMetricGlossary.ts';
import {
  SPLITS_BAR_COLOR,
  SPLITS_BAR_FILL,
  SPLITS_BAR_FILL_STOPS,
  SPLITS_BAR_RGB,
  SPLITS_FAST_PACE_TEXT_CLASS,
  SPLITS_HR_DELTA_CLASS,
  SPLITS_PACE_COL_CLASS,
  SPLITS_PACE_DELTA_DOWN_CLASS,
  SPLITS_PACE_DELTA_UP_CLASS,
  splitBarRatio,
  splitDeltaClass,
  splitPaceAxis,
  splitsBarFillGradient,
  ZONE_TABLE_GRID_CLASS,
  ZONE_TABLE_NAME_COL,
  hrZoneEmptyCaption,
  hrZoneFilledCaption,
  hrZoneTitle,
} from '../../../../core/analysisPanelCopy.ts';

const here = dirname(fileURLToPath(import.meta.url));
// The suite only asserts the Chinese copy; English strings are passed through
// for signature compatibility, so `en` stays unused on purpose.
const tr = (zh: string, _en: string) => zh;

describe('heart-rate zone copy', () => {
  it('has no under-title caption for device zones, and only “区间为估算” when estimated', () => {
    assert.equal(hrZoneFilledCaption(false, tr), undefined);
    assert.equal(hrZoneFilledCaption(true, tr), '区间为估算');
    assert.equal(
      hrZoneFilledCaption(true, (_, en) => en),
      'Zones are estimated'
    );
    assert.equal(hrZoneTitle(tr), '心率区间');
    assert.equal(messages.zh.hrZoneEstimatedCaption, '区间为估算');
    assert.equal(messages.en.hrZoneEstimatedCaption, 'Zones are estimated');
    const caption =
      messages.zh.hrZoneEstimatedCaption + messages.en.hrZoneEstimatedCaption;
    for (const banned of [
      '设备',
      'device',
      '乳酸阈',
      'lactate',
      '年龄',
      'Age-based',
      '算法',
      'algorithm',
    ]) {
      assert.doesNotMatch(caption, new RegExp(banned, 'i'));
    }
  });

  it('does not leave device-source tip strings in i18n or the analysis charts', () => {
    const i18n = JSON.stringify(messages);
    const charts = readFileSync(join(here, 'AnalysisCharts.tsx'), 'utf8');
    for (const banned of [
      '按设备记录的心率区间',
      'From your device',
      '按乳酸阈心率重新划分',
      'hrZoneTipDevice',
      'hrZoneTipLthr',
      'hrZoneTipMaxHrAge',
      'hrZoneTitleEstimated',
    ]) {
      assert.doesNotMatch(i18n, new RegExp(banned));
      assert.doesNotMatch(charts, new RegExp(banned));
    }
  });

  it('keeps empty-state captions only for the empty table', () => {
    assert.match(hrZoneEmptyCaption('no_hr_data', tr), /没有记录到心率/);
    assert.match(hrZoneEmptyCaption('no_baseline', tr), /信息不足/);
  });
});

describe('help copy and zone table layout', () => {
  it('uses the short recommended definitions, with no how-to-read section', () => {
    assert.equal(
      METRIC_GLOSSARY.vo.zh,
      '身体随每一步上下移动的幅度，通常越低越省力。'
    );
    assert.equal(METRIC_GLOSSARY.gct.zh, '脚接触地面的时长，通常越短越省力。');
    assert.equal(
      METRIC_GLOSSARY.vr.zh,
      '垂直振幅占步幅的比例，通常越低越省力。'
    );
    assert.equal(
      METRIC_GLOSSARY.cadence.zh,
      '每分钟落步的次数，通常较快更省力。'
    );
    assert.equal(
      METRIC_GLOSSARY.vo.en,
      'How much the body moves up and down with each step. Lower usually takes less effort.'
    );
    assert.equal(
      METRIC_GLOSSARY.gct.en,
      'How long the foot stays on the ground. Shorter usually takes less effort.'
    );
    assert.equal(
      METRIC_GLOSSARY.vr.en,
      'Vertical oscillation as a share of stride length. Lower usually takes less effort.'
    );
    assert.equal(
      METRIC_GLOSSARY.cadence.en,
      'Steps per minute. A quicker cadence usually takes less effort.'
    );
    for (const key of ['gct', 'vo', 'vr', 'cadence'] as const) {
      assert.equal(METRIC_GLOSSARY[key].howZh, undefined);
      assert.equal(METRIC_GLOSSARY[key].howEn, undefined);
      const blob = `${METRIC_GLOSSARY[key].zh}${METRIC_GLOSSARY[key].en}`;
      assert.doesNotMatch(blob, /佳明|Garmin|算法|algorithm/i);
    }
    const charts = readFileSync(join(here, 'AnalysisCharts.tsx'), 'utf8');
    assert.doesNotMatch(charts, /这是什么/);
    assert.doesNotMatch(charts, /可以怎么看/);
    assert.doesNotMatch(charts, /What it is/);
    assert.doesNotMatch(charts, /How to read it/);
    assert.match(METRIC_GLOSSARY.hrZones.zh, /分成几档/);
    assert.match(METRIC_GLOSSARY.hrZones.howZh ?? '', /停留了多久/);
  });

  it('shares a 6.5rem name column on every zone table', () => {
    assert.equal(ZONE_TABLE_NAME_COL, '6.5rem');
    assert.match(ZONE_TABLE_GRID_CLASS, /6\.5rem/);
    const src = readFileSync(join(here, 'AnalysisCharts.tsx'), 'utf8');
    assert.match(src, /ZONE_TABLE_GRID_CLASS/);
    assert.doesNotMatch(src, /grid-cols-\[4\.5rem/);
    assert.doesNotMatch(src, /grid-cols-\[5\.5rem/);
    assert.doesNotMatch(src, /grid-cols-\[7\.25rem/);
  });
});

describe('splits bars use running orange', () => {
  it('colors the bar and the fastest pace with color-run, not accent purple', () => {
    assert.equal(SPLITS_BAR_COLOR, 'var(--color-run)');
    assert.match(SPLITS_BAR_FILL, /var\(--color-run\)/);
    assert.equal(SPLITS_FAST_PACE_TEXT_CLASS, 'text-[var(--color-run)]');
    const src = readFileSync(join(here, '..', 'RunAnalysis.tsx'), 'utf8');
    assert.match(src, /SPLITS_BAR_FILL/);
    assert.match(src, /SPLITS_FAST_PACE_TEXT_CLASS/);
    assert.match(src, /splitPaceAxis/);
    assert.match(src, /splitBarRatio/);
    assert.match(src, /tr\('本趟最快', 'fastest split'\)/);
    assert.match(src, /sr-only/);
    assert.doesNotMatch(src, /tr\('快', 'Fast'\)/);
    assert.doesNotMatch(src, /25 \+ ratio \* 75/);
    assert.doesNotMatch(src, /opacity: 0\.35 \+ ratio \* 0\.55/);
    assert.doesNotMatch(src, /backgroundColor: 'var\(--color-accent\)'/);
    assert.doesNotMatch(
      src,
      /isFast \? 'font-semibold text-\[var\(--color-accent\)\]'/
    );
    assert.match(src, /SPLITS_PACE_COL_CLASS/);
    assert.equal(SPLITS_PACE_COL_CLASS, 'w-16 shrink-0 text-right');
  });

  it('uses the same translucent gradient on every bar, independent of pace', () => {
    assert.deepEqual(
      [...SPLITS_BAR_FILL_STOPS],
      [
        { offset: 0, opacity: 0.32 },
        { offset: 0.72, opacity: 0.5 },
        { offset: 1, opacity: 0.58 },
      ]
    );
    assert.equal(
      splitsBarFillGradient(SPLITS_BAR_RGB.light),
      'linear-gradient(90deg, rgba(196, 92, 38, 0.32) 0%, rgba(196, 92, 38, 0.50) 72%, rgba(196, 92, 38, 0.58) 100%)'
    );
    assert.equal(
      splitsBarFillGradient(SPLITS_BAR_RGB.dark),
      'linear-gradient(90deg, rgba(232, 168, 124, 0.32) 0%, rgba(232, 168, 124, 0.50) 72%, rgba(232, 168, 124, 0.58) 100%)'
    );
    for (const stop of SPLITS_BAR_FILL_STOPS) {
      const pct = `${Math.round(stop.offset * 100)}%`;
      const mix = `${Math.round(stop.opacity * 100)}%`;
      assert.match(
        SPLITS_BAR_FILL,
        new RegExp(`${mix}, transparent\\) ${pct}`)
      );
    }
    const src = readFileSync(join(here, '..', 'RunAnalysis.tsx'), 'utf8');
    assert.match(src, /background: SPLITS_BAR_FILL/);
    assert.doesNotMatch(src, /background:[^\n]*ratio/);
    assert.doesNotMatch(src, /0\.35 \+ ratio \* 0\.55/);
  });

  it('maps bar length on a cropped speed axis, not linear minutes or zero speed', () => {
    const fastest = 321; // 5'21"
    const slowest = 382; // 6'22"
    const axis = splitPaceAxis([fastest, 350, slowest]);
    assert.ok(axis);
    if (!axis) return;
    assert.ok(axis.slowPace > slowest, 'slow end should round out slower');
    assert.ok(axis.fastPace < fastest, 'fast end should round out faster');
    assert.ok(axis.ticks.length >= 2);
    const fastR = splitBarRatio(fastest, axis);
    const slowR = splitBarRatio(slowest, axis);
    const mid = 345;
    const midR = splitBarRatio(mid, axis);
    const speedMid =
      (1 / mid - 1 / axis.slowPace) / (1 / axis.fastPace - 1 / axis.slowPace);
    const linearMid = (axis.slowPace - mid) / (axis.slowPace - axis.fastPace);
    assert.ok(Math.abs(midR - speedMid) < 1e-9);
    assert.ok(
      Math.abs(speedMid - linearMid) > 0.02,
      'speed mapping should differ from linear minutes'
    );
    const fromZero = axis.fastPace / slowest; // speed from 0 to fastest
    assert.ok(
      slowR < fromZero - 0.1,
      'slow bar must not be measured from zero speed'
    );
    assert.ok(fastR > slowR);
    assert.ok(fastR < 1, 'fastest should not sit flush after padding');
    assert.ok(slowR > 0, 'slowest should not sit flush after padding');
  });

  it('keeps pace arrows green/red and uses one muted ink for HR up and down', () => {
    assert.equal(SPLITS_PACE_DELTA_UP_CLASS, 'text-emerald-500');
    assert.equal(SPLITS_PACE_DELTA_DOWN_CLASS, 'text-rose-500');
    assert.equal(SPLITS_HR_DELTA_CLASS, 'text-[var(--color-muted)]');
    assert.equal(splitDeltaClass('pace', true), SPLITS_PACE_DELTA_UP_CLASS);
    assert.equal(splitDeltaClass('pace', false), SPLITS_PACE_DELTA_DOWN_CLASS);
    assert.equal(splitDeltaClass('hr', true), SPLITS_HR_DELTA_CLASS);
    assert.equal(splitDeltaClass('hr', false), SPLITS_HR_DELTA_CLASS);
    assert.equal(splitDeltaClass('hr', true), splitDeltaClass('hr', false));
    assert.doesNotMatch(SPLITS_HR_DELTA_CLASS, /emerald|rose|green|red/i);
    assert.match(SPLITS_HR_DELTA_CLASS, /var\(--color-muted\)/);
    const src = readFileSync(join(here, '..', 'RunAnalysis.tsx'), 'utf8');
    assert.match(src, /splitDeltaClass\(kind, better\)/);
    assert.match(
      src,
      /<Delta\s+cur=\{r\.pace\}\s+prev=\{prev\?\.pace\}\s+invert\s+kind="pace"\s+\/>/
    );
    assert.match(
      src,
      /<Delta cur=\{r\.hr_avg\} prev=\{prev\?\.hr_avg\} kind="hr" \/>/
    );
    assert.doesNotMatch(src, /better \? 'text-emerald-500' : 'text-rose-500'/);
  });
});
