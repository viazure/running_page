import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  cadenceZoneLabels,
  cadenceZonesFromChart,
  formatClock,
  formatPaceSeconds,
  formatPaceZoneRange,
  paceZonesFromChart,
  thresholdPaceFromVo2max,
  type RunChart,
  type RunSplits,
  type ZoneInfo,
} from '@/core/splits';
import {
  DYNAMICS_BAND_COLORS,
  cadenceGarminZonesFromChart,
  dynamicsBandColor,
  dynamicsBandLabels,
  dynamicsBandRanges,
  type DynamicsMetric,
} from '@/core/runDynamicsBands';
import {
  MOTION_COLORS,
  buildMotionSegments,
  motionSeconds,
  type MotionKind,
} from '@/core/runMotionStatus';
import { METRIC_GLOSSARY, type GlossaryKey } from '@/core/runMetricGlossary';
import {
  bestPaceIndex,
  gradeAdjustedPaceSeries,
  lapAveragePaceSeries,
  movingAveragePace,
} from '@/core/runPaceVariants';
import { resolveHrZones, resolvePowerZones } from '@/core/runHrZones';
import { ANALYSIS_CONFIG_LTHR, ANALYSIS_HR_ZONES } from '@/core/config';

type N = number | null | undefined;
type Tr = (zh: string, en: string) => string;

const ZONE_COLORS = [
  '#9ca3af',
  '#5b9bd5',
  '#7cb342',
  '#f4c430',
  '#f59e0b',
  '#ef4444',
];

/** Garmin-ish metric colors */
const C = {
  pace: '#3b82f6',
  hr: '#ef4444',
  power: '#a855f7',
  cad: '#f97316',
  stride: '#14b8a6',
  vo: '#ec4899',
  gct: '#84cc16',
  alt: '#ca8a04',
  vr: '#a16207',
} as const;

const CHART_W = 720;
const CHART_H = 160;
const PAD = { t: 8, r: 0, b: 8, l: 0 };

const has = (v: N): v is number => v != null && Number.isFinite(v);

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return coarse;
}

function smooth(values: (number | null)[], window = 5): (number | null)[] {
  return values.map((v, i) => {
    if (!has(v)) return v;
    const win = values
      .slice(Math.max(0, i - Math.floor(window / 2)), i + Math.ceil(window / 2))
      .filter((x): x is number => has(x));
    win.sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)];
  });
}

function domain(values: number[], robust = true): [number, number] {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.round(p * (sorted.length - 1)))
      )
    ];
  let lo = robust ? q(0.02) : sorted[0];
  let hi = robust ? q(0.98) : sorted[sorted.length - 1];
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

/** Dynamics charts: full series min/max so peaks are not clipped at the axis. */
function scatterDomain(values: number[], avg: N): [number, number] {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (has(avg)) {
    lo = Math.min(lo, avg);
    hi = Math.max(hi, avg);
  }
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  // ~7% pad keeps chip/series extrema inside the plot (was P1–P99 + 12%).
  const pad = (hi - lo) * 0.07;
  return [lo - pad, hi + pad];
}

function tickValues(lo: number, hi: number, n: number): number[] {
  if (n <= 1) return [lo];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

function movingMean(
  values: (number | null)[],
  radius: number
): (number | null)[] {
  return values.map((v, i) => {
    if (!has(v)) return null;
    let sum = 0;
    let n = 0;
    const a = Math.max(0, i - radius);
    const b = Math.min(values.length, i + radius + 1);
    for (let j = a; j < b; j++) {
      const x = values[j];
      if (!has(x)) continue;
      sum += x;
      n += 1;
    }
    return n ? sum / n : null;
  });
}

/** Colour index for an HR sample. Without FIT zone boundaries, falls back to
 * an estimate of 50/60/70/80/90 % of the max HR seen in this activity. */
function hrZoneIndex(
  hr: number,
  boundaries: (number | null)[] | null | undefined,
  maxHr?: number | null
): number {
  if (!boundaries?.length) {
    if (!maxHr || maxHr <= 0) return 2;
    const pct = hr / maxHr;
    if (pct < 0.5) return 0;
    if (pct < 0.6) return 1;
    if (pct < 0.7) return 2;
    if (pct < 0.8) return 3;
    if (pct < 0.9) return 4;
    return 5;
  }
  for (let i = 0; i < boundaries.length; i++) {
    const hi = boundaries[i];
    if (hi != null && hr <= hi) return i;
  }
  return Math.min(5, boundaries.length);
}

/** stride (m) from pace (s/km) and cadence (spm). */
function seriesMax(series?: (number | null)[]): number | null {
  const vals = (series ?? []).filter((v): v is number => has(v));
  return vals.length ? Math.max(...vals) : null;
}

/** Prefer the chart series max when summary cadence_max is a sensor spike. */
function cadenceChipMax(summaryMax: N, series?: (number | null)[]): N {
  const vals = (series ?? []).filter((v): v is number => has(v));
  const seriesMax = vals.length ? Math.max(...vals) : null;
  if (has(summaryMax) && has(seriesMax) && summaryMax > seriesMax * 1.15) {
    return Math.round(seriesMax);
  }
  return has(seriesMax) ? Math.round(seriesMax) : summaryMax;
}

const CADENCE_SPIKE_UI = 220;

/** Chart-mean cadence for colour/avg chips (ignore walk/stop & sensor spikes). */
function cadenceChartAvg(series?: (number | null)[]): N {
  const vals = (series ?? []).filter(
    (v): v is number => has(v) && v >= 100 && v <= CADENCE_SPIKE_UI
  );
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Treat non-positive power as a gap (APP-like white seams). */
function powerSeriesWithGaps(series?: (number | null)[]): (number | null)[] {
  return (series ?? []).map((v) => (has(v) && v > 0 ? v : null));
}

function strideFrom(pace: N, cad: N): number | null {
  if (!has(pace) || !has(cad) || pace <= 0 || cad <= 0) return null;
  return 60000 / (pace * cad);
}

function enrichChart(
  chart: RunChart
): RunChart & { stride?: (number | null)[] } {
  const pace = chart.pace;
  const cad = chart.cad;
  if (!pace || !cad) return chart;
  const stride = pace.map((p, i) => strideFrom(p, cad[i]));
  if (!stride.some((v) => has(v))) return chart;
  return { ...chart, stride };
}

/** Build X values: distance (km) or time (seconds). Fallback: integrate pace. */
function chartAxis(
  chart: RunChart & { stride?: (number | null)[] },
  mode: 'distance' | 'time'
): number[] {
  if (mode === 'distance') return chart.d;
  if (chart.t && chart.t.length === chart.d.length) return chart.t;
  // Derive time from pace × Δdistance when FIT chart lacks t.
  const xs = [0];
  for (let i = 1; i < chart.d.length; i++) {
    const pace = chart.pace?.[i] ?? chart.pace?.[i - 1];
    const dd = Math.max(0, chart.d[i] - chart.d[i - 1]);
    const dt = has(pace) && pace > 0 ? pace * dd : 0;
    xs.push(xs[i - 1] + dt);
  }
  return xs;
}

function formatAxis(v: number, mode: 'distance' | 'time'): string {
  if (mode === 'distance') return v.toFixed(1);
  const s = Math.max(0, Math.round(v));
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, '0');
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${r}`
    : `${m}:${r}`;
}

/** Start, a few even steps, and the end — not only 0 / mid / finish. */
function axisMarks(
  x0: number,
  x1: number,
  mode: 'distance' | 'time'
): number[] {
  const span = x1 - x0;
  if (!(span > 0)) return [x0];
  const steps =
    mode === 'distance'
      ? [0.2, 0.5, 1, 2, 5, 10]
      : [30, 60, 120, 300, 600, 900, 1200, 1800];
  let step = steps[steps.length - 1];
  for (const s of steps) {
    if (span / s <= 6) {
      step = s;
      break;
    }
  }
  const marks = [x0];
  let x = Math.ceil((x0 + step * 0.25) / step) * step;
  while (x < x1 - step * 0.7) {
    marks.push(x);
    x += step;
  }
  marks.push(x1);
  const kept: number[] = [];
  let prev = '';
  for (const m of marks) {
    const label = formatAxis(m, mode);
    if (label === prev) kept.pop();
    kept.push(m);
    prev = label;
  }
  return kept;
}

// ---------------------------------------------------------------- zones
/** HR/power: higher number = higher zone. */
function formatZoneRange(
  unit: string,
  lo: number | null | undefined,
  hi: number | null | undefined,
  i: number
): string {
  if (i === 0) return has(hi) ? `< ${Math.round(hi)}` : '';
  if (!has(lo)) return '';
  if (has(hi) && hi < 4000) {
    return `${Math.round(Number(lo) + (unit === 'bpm' ? 1 : 0))}–${Math.round(hi)}`;
  }
  return `≥ ${Math.round(lo)}`;
}

function ZoneTable({
  title,
  zone,
  colors,
  unit,
  tr,
  labels,
}: {
  title: string;
  zone: ZoneInfo;
  colors: string[];
  unit: string;
  tr: Tr;
  labels?: string[];
}) {
  const secs = zone.seconds;
  const total = secs.reduce((a, b) => a + b, 0);
  if (!total) return null;
  // Zones not configured on the device (HR % of max, chart-derived pace).
  const estimated = /estimated|derived/.test(zone.calc_type ?? '');
  const hb = zone.high_boundary ?? [];
  const rows = secs
    .map((sec, i) => {
      const lo = i === 0 ? null : hb[i - 1];
      const hi = hb[i];
      const range =
        unit === '/km'
          ? formatPaceZoneRange(lo, hi, i)
          : formatZoneRange(unit, lo, hi, i);
      const name = labels?.[i] ?? (i === 0 ? '<Z1' : `Z${i}`);
      return {
        i,
        sec,
        pct: (sec / total) * 100,
        range,
        name,
        color: colors[Math.min(i, colors.length - 1)],
      };
    })
    .filter((r) => r.sec > 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          {title}
          {estimated ? (
            <span
              className="rounded bg-[var(--color-sunken)] px-1.5 py-px text-[10px] font-normal text-[var(--color-muted)]"
              title={tr(
                '设备未提供区间，按本次数据估算',
                'No device zones; estimated from this activity'
              )}
            >
              {tr('估算', 'Estimated')}
            </span>
          ) : null}
        </p>
        {has(zone.max_hr) ? (
          <p className="text-[10px] text-[var(--color-muted)]">
            {tr('最大', 'Max')} {zone.max_hr}
            {has(zone.threshold_hr) && zone.threshold_hr > 0
              ? ` · LTHR ${zone.threshold_hr}`
              : ''}
          </p>
        ) : has(zone.ftp) ? (
          <p className="text-[10px] text-[var(--color-muted)]">
            FTP {zone.ftp} W
          </p>
        ) : has(zone.threshold_pace) ? (
          <p className="text-[10px] text-[var(--color-muted)]">
            LTP {formatPaceSeconds(zone.threshold_pace)}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.i}
            className={`grid items-center gap-2 text-[11px] ${
              unit === '/km'
                ? 'grid-cols-[7.25rem_1fr_auto]'
                : unit === 'spm'
                  ? 'grid-cols-[5.5rem_1fr_auto]'
                  : 'grid-cols-[4.5rem_1fr_auto]'
            }`}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                {unit === 'spm' ? (
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: r.color }}
                    aria-hidden
                  />
                ) : null}
                {r.name}
              </p>
              {r.range ? (
                <p className="truncate text-[10px] text-[var(--color-muted)]">
                  {r.range}
                  {unit === '/km' || unit === 'spm' ? '' : ` ${unit}`}
                </p>
              ) : null}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-sunken)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, r.pct)}%`,
                  backgroundColor: r.color,
                }}
              />
            </div>
            <div className="metric w-[4.75rem] text-right text-[var(--color-muted)]">
              {formatClock(r.sec)}
              <span className="ml-1 text-[var(--color-text)]">
                {Math.round(r.pct)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function paceZoneLabels(zone: ZoneInfo): string[] | undefined {
  const n = zone.seconds.length;
  if (n <= 5) return zone.seconds.map((_, i) => `Z${i + 1}`);
  return undefined;
}

// ---------------------------------------------------------------- help (? glossary)
const GLOSSARY_DYNAMICS: Partial<Record<GlossaryKey, DynamicsMetric>> = {
  gct: 'gct',
  vo: 'vo',
  vr: 'vr',
  cadence: 'cadence',
};

const BAND_QUALITY = [
  { zh: '很好', en: 'Excellent' },
  { zh: '较好', en: 'Good' },
  { zh: '中等', en: 'Average' },
  { zh: '偏弱', en: 'Fair' },
  { zh: '较弱', en: 'Poor' },
] as const;

function MetricHelp({
  k,
  tr,
}: {
  k: GlossaryKey;
  tr: (zh: string, en: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const g = METRIC_GLOSSARY[k];
  const dynKey = GLOSSARY_DYNAMICS[k];
  const bandRows = dynKey
    ? dynamicsBandLabels(dynKey).map((row, i) => ({
        ...row,
        quality: BAND_QUALITY[i],
      }))
    : null;
  const tipWidth = bandRows ? 260 : 224;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(
        8,
        Math.min(r.left, window.innerWidth - tipWidth - 8)
      );
      const below = r.bottom + 6;
      const tipH = tipRef.current?.offsetHeight ?? 96;
      const top =
        below + tipH > window.innerHeight - 8
          ? Math.max(8, r.top - tipH - 6)
          : below;
      setPos({ top, left });
    };
    const raf = requestAnimationFrame(place);
    const onDoc = (e: Event) => {
      const t = e.target as Node | null;
      if (btnRef.current?.contains(t)) return;
      if (tipRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => setOpen(false);
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    const scroll = document.querySelector('.run-analysis-scroll');
    scroll?.addEventListener('scroll', onReposition, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      scroll?.removeEventListener('scroll', onReposition);
    };
  }, [open, tipWidth]);

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        aria-label={tr('说明', 'Help')}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            if (!v) {
              const r = btnRef.current?.getBoundingClientRect();
              if (r) {
                setPos({
                  top: r.bottom + 6,
                  left: Math.max(
                    8,
                    Math.min(r.left, window.innerWidth - tipWidth - 8)
                  ),
                });
              }
            }
            return !v;
          });
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] text-[11px] leading-none text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        ?
      </button>
      {open
        ? createPortal(
            <span
              ref={tipRef}
              role="tooltip"
              className={`fixed z-[90] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2 text-[11px] leading-snug font-normal text-[var(--color-text)] shadow-lg ${
                bandRows ? 'w-[16.25rem]' : 'w-56'
              }`}
              style={{ top: pos.top, left: pos.left }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="mb-0.5 block font-semibold">
                {tr(g.titleZh, g.titleEn)}
              </span>
              <span className="block text-[var(--color-muted)]">
                {tr(g.zh, g.en)}
              </span>
              {bandRows ? (
                <ul className="mt-1.5 space-y-1 border-t border-[var(--color-border)] pt-1.5">
                  {bandRows.map((row) => (
                    <li
                      key={`${row.color}-${row.label}`}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-sm"
                        style={{ background: row.color }}
                        aria-hidden
                      />
                      <span>
                        {tr(row.quality.zh, row.quality.en)}
                        <span className="text-[var(--color-muted)]">
                          {' '}
                          · {row.label}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}

function MotionStatusBar({
  data,
  tr,
}: {
  data: RunSplits;
  tr: (zh: string, en: string) => string;
}) {
  const chart = data.chart;
  const segs = useMemo(() => {
    if (!chart?.d?.length) return [];
    return buildMotionSegments({
      pace: chart.pace,
      cad: chart.cad,
      activity: chart.activity,
      length: chart.d.length,
    });
  }, [chart]);
  const secs = useMemo(() => motionSeconds(segs, chart?.t), [segs, chart?.t]);
  const total = secs.run + secs.walk + secs.stop;
  if (!segs.length || total < 1) return null;
  const labels: Record<MotionKind, string> = {
    run: tr('跑步', 'Run'),
    walk: tr('步行', 'Walk'),
    stop: tr('静止', 'Stop'),
  };
  const fromFit = Boolean(chart?.activity?.some((v) => v));
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold">
          {tr('运动状态', 'Activity status')}
          {!fromFit ? (
            <span className="ml-1.5 text-[10px] font-normal text-[var(--color-muted)]">
              {tr('由步频+配速推断', 'Inferred from cadence + pace')}
            </span>
          ) : null}
        </p>
        <p className="metric text-[10px] text-[var(--color-muted)]">
          {(['run', 'walk', 'stop'] as MotionKind[])
            .filter((k) => secs[k] > 0)
            .map((k) => `${labels[k]} ${formatClock(secs[k])}`)
            .join(' · ')}
        </p>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--color-sunken)]">
        {segs.map((s) => {
          const w = ((s.to - s.from) / (chart?.d.length || 1)) * 100;
          return (
            <div
              key={`${s.kind}-${s.from}-${s.to}`}
              title={labels[s.kind]}
              style={{
                width: `${Math.max(0.4, w)}%`,
                backgroundColor: MOTION_COLORS[s.kind],
              }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-[var(--color-muted)]">
        {(['run', 'walk', 'stop'] as MotionKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span
              className="inline-block size-1.5 rounded-full"
              style={{ background: MOTION_COLORS[k] }}
            />
            {labels[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

type ChartKind = 'area' | 'hr-area' | 'scatter';
type HrDrawStyle = 'fill' | 'zones';
type PaceVariant = 'instant' | 'lap' | 'gap';

interface TrendDef {
  key: string;
  title: string;
  unit: string;
  color: string;
  kind: ChartKind;
  invert?: boolean;
  format: (v: number) => string;
  avg?: N;
  max?: N;
  extra?: N;
  avgLabel?: string;
  maxLabel?: string;
  extraLabel?: string;
  series: (number | null)[];
  helpKey?: GlossaryKey;
  dynamicsMetric?: DynamicsMetric;
  meanColor?: string | null;
}

function MetricCard({
  def,
  xs,
  mode,
  hover,
  onHover,
  onPin,
  coarse,
  zoneBounds,
  footer,
  prominent = false,
  overlay,
  overlayIsArea = false,
  onSwapOverlay,
  compareChips,
  headerControls,
  titleNode,
  titleAddon,
  hrDrawStyle = 'fill',
  bestIndex = null,
  tr,
}: {
  def: TrendDef;
  xs: number[];
  mode: 'distance' | 'time';
  hover: number | null;
  onHover: (i: number | null) => void;
  onPin: (i: number) => void;
  coarse: boolean;
  zoneBounds?: (number | null)[] | null;
  footer?: ReactNode;
  prominent?: boolean;
  overlay?: TrendDef | null;
  /** When true, overlay draws as area and primary as line. */
  overlayIsArea?: boolean;
  onSwapOverlay?: () => void;
  compareChips?: ReactNode;
  headerControls?: ReactNode;
  /** Replaces the plain title text (e.g. pace variant dropdown). */
  titleNode?: ReactNode;
  /** Inline controls after the title (e.g. HR draw-style chips). */
  titleAddon?: ReactNode;
  hrDrawStyle?: HrDrawStyle;
  bestIndex?: number | null;
  tr: Tr;
}) {
  const tapRef = useRef<{
    x: number;
    y: number;
    scrubbing: boolean;
    pointerId: number;
  } | null>(null);

  const ys = useMemo(() => {
    if (def.kind === 'scatter') return def.series;
    if (def.kind === 'hr-area') return def.series;
    return smooth(def.series, 5);
  }, [def.series, def.kind]);
  const oys = useMemo(() => {
    if (!overlay) return null;
    if (overlay.kind === 'scatter' || overlay.kind === 'hr-area')
      return overlay.series;
    return smooth(overlay.series, 5);
  }, [overlay]);

  const valid = useMemo(() => ys.filter((v): v is number => has(v)), [ys]);
  const ovalid = useMemo(
    () => (oys ? oys.filter((v): v is number => has(v)) : []),
    [oys]
  );
  const avgVal = has(def.avg)
    ? def.avg
    : valid.length
      ? valid.reduce((a, b) => a + b, 0) / valid.length
      : null;

  const geom = useMemo(() => {
    if (valid.length < 2 || xs.length < 2) return null;
    const [lo, hi] =
      def.kind === 'scatter'
        ? scatterDomain(valid, def.avg ?? null)
        : domain(valid, false);
    const x0 = xs[0];
    const x1 = xs[xs.length - 1] || 1;
    const iw = CHART_W - PAD.l - PAD.r;
    const ih = CHART_H - PAD.t - PAD.b;
    const px = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * iw;
    const py = (v: number) => {
      const c = Math.min(hi, Math.max(lo, v));
      const t = (c - lo) / (hi - lo);
      return def.invert ? PAD.t + t * ih : PAD.t + (1 - t) * ih;
    };
    const yCount = def.kind === 'scatter' ? 4 : 3;
    const ticks: { y: number; label: string }[] = [];
    for (const v of tickValues(lo, hi, yCount)) {
      const label = def.format(v);
      if (ticks.some((t) => t.label === label)) continue;
      ticks.push({ y: py(v), label });
    }
    const xTicks = axisMarks(x0, x1, mode).map((x) => ({
      x: px(x),
      label: formatAxis(x, mode),
    }));
    return { px, py, lo, hi, ticks, xTicks, x0, x1, iw, ih };
  }, [xs, valid, def, mode]);

  const ogeom = useMemo(() => {
    if (!overlay || !oys || ovalid.length < 2 || !geom) return null;
    const [lo, hi] =
      overlay.kind === 'scatter'
        ? scatterDomain(ovalid, overlay.avg ?? null)
        : domain(ovalid, false);
    const ih = CHART_H - PAD.t - PAD.b;
    const py = (v: number) => {
      const c = Math.min(hi, Math.max(lo, v));
      const t = (c - lo) / (hi - lo);
      return overlay.invert ? PAD.t + t * ih : PAD.t + (1 - t) * ih;
    };
    const ticks: { y: number; label: string }[] = [];
    for (const v of tickValues(lo, hi, 3)) {
      const label = overlay.format(v);
      if (ticks.some((t) => t.label === label)) continue;
      ticks.push({ y: py(v), label });
    }
    return { py, lo, hi, ticks };
  }, [overlay, oys, ovalid, geom]);

  if (!geom) return null;

  const indexAtClientX = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // Match geom.px: data domain maps into [PAD.l, CHART_W-PAD.r] within viewBox.
    const svgX = frac * CHART_W;
    const u = (svgX - PAD.l) / (CHART_W - PAD.l - PAD.r || 1);
    const target = geom.x0 + Math.max(0, Math.min(1, u)) * (geom.x1 - geom.x0);
    let best = 0;
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i] - target) < Math.abs(xs[best] - target)) best = i;
    }
    return best;
  };
  const hoverAtClientX = (clientX: number, el: HTMLElement) => {
    onHover(indexAtClientX(clientX, el));
  };

  const TAP_PX = 12;
  const SCRUB_PX = 12;

  const onFinePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    hoverAtClientX(e.clientX, e.currentTarget);
  };
  const onFinePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = indexAtClientX(e.clientX, e.currentTarget);
    onHover(i);
    onPin(i);
  };
  const onFinePointerLeave = () => {
    onHover(null);
  };

  const onCoarsePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    tapRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrubbing: false,
      pointerId: e.pointerId,
    };
  };
  const onCoarsePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = tapRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (start.scrubbing) {
      hoverAtClientX(e.clientX, e.currentTarget);
      return;
    }
    if (adx > SCRUB_PX && adx > ady) {
      start.scrubbing = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      hoverAtClientX(e.clientX, e.currentTarget);
    }
  };
  const onCoarsePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = tapRef.current;
    tapRef.current = null;
    if (!start || e.pointerId !== start.pointerId) return;
    if (start.scrubbing) {
      hoverAtClientX(e.clientX, e.currentTarget);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      return;
    }
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    if (dx <= TAP_PX && dy <= TAP_PX) {
      hoverAtClientX(e.clientX, e.currentTarget);
    }
  };
  const onCoarsePointerCancel = () => {
    tapRef.current = null;
  };

  const buildLine = (series: (number | null)[], py: (v: number) => number) => {
    let d = '';
    let pen = false;
    series.forEach((v, i) => {
      if (!has(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${geom.px(xs[i]).toFixed(1)},${py(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  /** Closed area polygons per continuous run (nulls / zeros become white gaps). */
  const buildAreaSegs = (
    series: (number | null)[],
    py: (v: number) => number
  ): string[] => {
    const segs: string[] = [];
    let d = '';
    let pen = false;
    let firstX = 0;
    let lastX = 0;
    const base = (PAD.t + geom.ih).toFixed(1);
    const flush = () => {
      if (!pen || !d) return;
      segs.push(
        `${d}L${lastX.toFixed(1)},${base}L${firstX.toFixed(1)},${base}Z`
      );
      d = '';
      pen = false;
    };
    series.forEach((v, i) => {
      if (!has(v)) {
        flush();
        return;
      }
      const x = geom.px(xs[i]);
      if (!pen) firstX = x;
      lastX = x;
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${py(v).toFixed(1)}`;
      pen = true;
    });
    flush();
    return segs;
  };
  const buildArea = (line: string) => {
    if (!line) return '';
    return `${line}L${geom.px(xs[xs.length - 1]).toFixed(1)},${(PAD.t + geom.ih).toFixed(1)}L${geom.px(xs[0]).toFixed(1)},${(PAD.t + geom.ih).toFixed(1)}Z`;
  };

  let linePath = '';
  let areaPath = '';
  let areaSegs: string[] = [];
  let bandPath = '';
  const hrSegs: { d: string; color: string }[] = [];
  const dots: { x: number; y: number; color: string }[] = [];
  const dynSegs: { d: string; color: string }[] = [];

  if (def.kind === 'scatter') {
    const radius = Math.max(8, Math.round(def.series.length / 28));
    const band = movingMean(def.series, radius);
    const dynMetric = def.dynamicsMetric;
    let pen = false;
    let d = '';
    let firstX = 0;
    let lastX = 0;
    let started = false;
    // Soft fill under the trend (muted); band colouring lives on stroke + dots.
    band.forEach((v, i) => {
      if (!has(v)) {
        pen = false;
        return;
      }
      const x = geom.px(xs[i]);
      if (!started) firstX = x;
      lastX = x;
      started = true;
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${geom.py(v).toFixed(1)}`;
      pen = true;
    });
    if (d) {
      const base = (PAD.t + geom.ih).toFixed(1);
      bandPath = `${d}L${lastX.toFixed(1)},${base}L${firstX.toFixed(1)},${base}Z`;
    }
    // Multi-segment trend stroke coloured by Garmin band (same pattern as HR zones).
    if (dynMetric) {
      let cur = '';
      let color = DYNAMICS_BAND_COLORS[2];
      let segPen = false;
      band.forEach((v, i) => {
        if (!has(v)) {
          if (segPen && cur) dynSegs.push({ d: cur, color });
          segPen = false;
          cur = '';
          return;
        }
        const c = dynamicsBandColor(dynMetric, v) ?? DYNAMICS_BAND_COLORS[2];
        const pt = `${geom.px(xs[i]).toFixed(1)},${geom.py(v).toFixed(1)}`;
        if (segPen && c !== color) {
          dynSegs.push({ d: cur, color });
          const prev = i > 0 && has(band[i - 1]) ? band[i - 1]! : v;
          cur = `M${geom.px(xs[i - 1] ?? xs[i]).toFixed(1)},${geom.py(prev).toFixed(1)}L${pt}`;
          color = c;
        } else {
          if (!segPen) color = c;
          cur += `${segPen ? 'L' : 'M'}${pt}`;
        }
        segPen = true;
      });
      if (segPen && cur) dynSegs.push({ d: cur, color });
    }
    const validIdx: number[] = [];
    ys.forEach((v, i) => {
      if (has(v)) validIdx.push(i);
    });
    const maxDots = 480;
    const pushDot = (i: number, yVal: number) => {
      const color =
        (dynMetric && dynamicsBandColor(dynMetric, yVal)) || def.color;
      dots.push({
        x: geom.px(xs[i]),
        y: geom.py(yVal),
        color,
      });
    };
    if (validIdx.length <= maxDots) {
      for (const i of validIdx) {
        pushDot(i, ys[i] as number);
      }
    } else {
      // Bucket by x so dots span the full domain; always pin first & last.
      const inner = Math.max(1, maxDots - 2);
      const buckets: number[][] = Array.from({ length: inner }, () => []);
      const x0 = xs[validIdx[0]];
      const x1 = xs[validIdx[validIdx.length - 1]];
      const span = x1 - x0 || 1;
      const first = validIdx[0];
      const last = validIdx[validIdx.length - 1];
      for (const i of validIdx) {
        if (i === first || i === last) continue;
        let b = Math.floor(((xs[i] - x0) / span) * inner);
        if (b < 0) b = 0;
        if (b >= inner) b = inner - 1;
        buckets[b].push(i);
      }
      pushDot(first, ys[first] as number);
      for (const group of buckets) {
        if (!group.length) continue;
        const mid = group[Math.floor(group.length / 2)];
        const samples = group
          .map((i) => ys[i])
          .filter((v): v is number => has(v))
          .sort((a, b) => a - b);
        const y = samples[Math.floor(samples.length / 2)];
        pushDot(mid, y);
      }
      pushDot(last, ys[last] as number);
    }
  } else if (def.kind === 'hr-area') {
    let cur = '';
    let color = ZONE_COLORS[1];
    let pen = false;
    ys.forEach((v, i) => {
      if (!has(v)) {
        if (pen && cur) hrSegs.push({ d: cur, color });
        pen = false;
        cur = '';
        return;
      }
      const c = ZONE_COLORS[hrZoneIndex(v, zoneBounds, def.max)];
      const pt = `${geom.px(xs[i]).toFixed(1)},${geom.py(v).toFixed(1)}`;
      if (pen && c !== color) {
        hrSegs.push({ d: cur, color });
        const prev = i > 0 && has(ys[i - 1]) ? ys[i - 1]! : v;
        cur = `M${geom.px(xs[i - 1] ?? xs[i]).toFixed(1)},${geom.py(prev).toFixed(1)}L${pt}`;
        color = c;
      } else {
        if (!pen) color = c;
        cur += `${pen ? 'L' : 'M'}${pt}`;
      }
      pen = true;
    });
    if (pen && cur) hrSegs.push({ d: cur, color });
    if (hrDrawStyle === 'fill') {
      let area = '';
      let ap = false;
      ys.forEach((v, i) => {
        if (!has(v)) {
          ap = false;
          return;
        }
        area += `${ap ? 'L' : 'M'}${geom.px(xs[i]).toFixed(1)},${geom.py(v).toFixed(1)}`;
        ap = true;
      });
      if (area) {
        areaPath = `${area}L${geom.px(xs[xs.length - 1]).toFixed(1)},${(PAD.t + geom.ih).toFixed(1)}L${geom.px(xs[0]).toFixed(1)},${(PAD.t + geom.ih).toFixed(1)}Z`;
      }
    }
  } else {
    linePath = buildLine(ys, geom.py);
    if (!overlay) {
      areaSegs = buildAreaSegs(ys, geom.py);
    }
  }

  // Dual-metric overlay: bottom area + top line (roles swappable).
  // hr-area joins this path so HR-as-primary gets a solid area (not zone strokes).
  let primaryLine = linePath;
  let primaryArea = areaPath;
  let overlayLine = '';
  let overlayArea = '';
  if (overlay && oys && ogeom && def.kind !== 'scatter') {
    const pLine = buildLine(ys, geom.py);
    const oLine = buildLine(oys, ogeom.py);
    if (overlayIsArea) {
      overlayArea = buildArea(oLine);
      primaryLine = pLine;
      primaryArea = '';
      overlayLine = '';
    } else {
      primaryArea = buildArea(pLine);
      primaryLine = '';
      overlayLine = oLine;
      overlayArea = '';
    }
  } else if (overlay && oys && ogeom) {
    // Scatter primary: draw overlay as line on right axis.
    overlayLine = buildLine(oys, ogeom.py);
  }

  const hv = hover != null ? ys[hover] : null;
  const ohv = hover != null && oys ? oys[hover] : null;
  const avgY =
    has(avgVal) && avgVal >= geom.lo && avgVal <= geom.hi
      ? geom.py(avgVal)
      : null;

  // Same plot height for area + scatter so power/cadence row footers align.
  const plotH = prominent ? 'h-44 @min-[40rem]:h-56' : 'h-36 @min-[40rem]:h-40';

  const meanColor = def.meanColor || def.color;
  const dynBgBands =
    def.dynamicsMetric && def.kind === 'scatter'
      ? dynamicsBandRanges(def.dynamicsMetric, geom.lo, geom.hi).map((r) => {
          const yTop = geom.py(r.hi);
          const yBot = geom.py(r.lo);
          return {
            y: Math.min(yTop, yBot),
            h: Math.abs(yBot - yTop),
            color: r.color,
          };
        })
      : [];

  return (
    <div data-run-metric-card="" className="min-w-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
            {overlay ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ background: def.color }}
                  />
                  {def.title}
                  <span className="text-[10px] font-normal text-[var(--color-muted)]">
                    {overlayIsArea
                      ? tr('折线·主', 'Line · primary')
                      : tr('面积·主', 'Area · primary')}
                  </span>
                </span>
                <span className="text-[11px] font-normal text-[var(--color-muted)]">
                  +
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ background: overlay.color }}
                  />
                  {overlay.title}
                  <span className="text-[10px] font-normal text-[var(--color-muted)]">
                    {overlayIsArea
                      ? tr('面积·叠', 'Area · overlay')
                      : tr('折线·叠', 'Line · overlay')}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ background: meanColor }}
                />
                {titleNode ?? def.title}
                {titleAddon}
              </>
            )}
            {def.helpKey ? <MetricHelp k={def.helpKey} tr={tr} /> : null}
            {def.kind === 'scatter' && !overlay ? (
              <span className="text-[11px] font-normal text-[var(--color-muted)]">
                {def.unit}
              </span>
            ) : null}
            {overlay && onSwapOverlay ? (
              <button
                type="button"
                onClick={onSwapOverlay}
                className="ml-1 cursor-pointer rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-normal text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                {tr('对调面积/折线', 'Swap area/line')}
              </button>
            ) : null}
          </p>
          {headerControls}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4">
            {has(def.avg) || has(avgVal) ? (
              <p className="metric text-lg leading-none font-semibold @min-[40rem]:text-xl">
                <span style={{ color: meanColor }}>
                  {def.format((def.avg ?? avgVal) as number)}
                </span>
                <span className="ml-1 text-[11px] font-normal text-[var(--color-muted)]">
                  {def.kind === 'scatter' ? (def.avgLabel ?? 'Avg') : def.unit}
                </span>
                {def.kind !== 'scatter' ? (
                  <span className="ml-1.5 text-[10px] font-normal text-[var(--color-muted)]">
                    {def.avgLabel ?? 'Avg'}
                  </span>
                ) : null}
              </p>
            ) : null}
            {has(def.max) ? (
              <p className="metric text-[13px] text-[var(--color-muted)]">
                {def.format(def.max)}
                <span className="ml-1 text-[10px]">
                  {def.kind === 'scatter'
                    ? (def.maxLabel ?? 'Max')
                    : `${def.unit} · ${def.maxLabel ?? 'Max'}`}
                </span>
              </p>
            ) : null}
            {has(def.extra) ? (
              <p className="metric text-[13px] text-[var(--color-muted)]">
                {def.format(def.extra)}
                <span className="ml-1 text-[10px]">
                  {def.unit} · {def.extraLabel ?? ''}
                </span>
              </p>
            ) : null}
          </div>
        </div>
        <p
          className={`metric shrink-0 text-right text-[12px] text-[var(--color-muted)] ${
            overlay ? 'min-h-[2.75rem]' : 'h-[2.125rem]'
          } ${hover == null ? 'invisible' : ''}`}
          aria-hidden={hover == null}
        >
          {overlay ? (
            <>
              <span className="block text-[10px] text-[var(--color-muted)]">
                <span
                  className="mr-1 inline-block size-1.5 rounded-full align-middle"
                  style={{ background: def.color }}
                />
                {def.title}
              </span>
              <span
                className="text-base font-semibold"
                style={{ color: def.color }}
              >
                {has(hv) ? def.format(hv) : '--'}
              </span>{' '}
              <span className="text-[10px]">{def.unit}</span>
              <span className="mt-0.5 block text-[10px] text-[var(--color-muted)]">
                <span
                  className="mr-1 inline-block size-1.5 rounded-full align-middle"
                  style={{ background: overlay.color }}
                />
                {overlay.title}{' '}
                <span
                  className="font-semibold"
                  style={{ color: overlay.color }}
                >
                  {has(ohv) ? overlay.format(ohv) : '--'}
                </span>{' '}
                {overlay.unit}
              </span>
            </>
          ) : (
            <>
              <span className="text-base font-semibold text-[var(--color-text)]">
                {has(hv) ? def.format(hv) : '--'}
              </span>{' '}
              {def.unit}
              <span className="mt-0.5 block text-[10px]">
                {hover != null
                  ? `${formatAxis(xs[hover], mode)}${mode === 'distance' ? ' km' : ''}`
                  : '\u00a0'}
              </span>
            </>
          )}
        </p>
      </div>
      <div
        className={`grid gap-x-1.5 ${overlay ? 'grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]' : 'grid-cols-[2.5rem_minmax(0,1fr)]'} ${plotH}`}
      >
        <div className="relative">
          {geom.ticks.map((tick) => (
            <span
              key={`y-${tick.label}`}
              className="metric absolute right-0 -translate-y-1/2 text-[10px] leading-none text-[var(--color-muted)]"
              style={{ top: `${(tick.y / CHART_H) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        <div
          className="relative min-w-0 select-none"
          style={coarse ? { touchAction: 'pan-y' } : undefined}
          onPointerDown={coarse ? onCoarsePointerDown : onFinePointerDown}
          onPointerMove={coarse ? onCoarsePointerMove : onFinePointerMove}
          onPointerUp={coarse ? onCoarsePointerUp : undefined}
          onPointerCancel={coarse ? onCoarsePointerCancel : undefined}
          onPointerLeave={coarse ? undefined : onFinePointerLeave}
        >
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            className="block h-full w-full overflow-visible"
          >
            {geom.ticks.map((tick) => (
              <line
                key={`grid-${tick.label}`}
                x1={PAD.l}
                x2={CHART_W - PAD.r}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--color-border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {dynBgBands.map((b) => (
              <rect
                key={`dyn-bg-${b.color}-${b.y.toFixed(1)}`}
                x={PAD.l}
                y={b.y}
                width={CHART_W - PAD.l - PAD.r}
                height={b.h}
                fill={b.color}
                opacity={0.08}
              />
            ))}
            {bandPath ? (
              <path d={bandPath} fill="var(--color-muted)" opacity={0.12} />
            ) : null}
            {primaryArea ? (
              <path d={primaryArea} fill={def.color} opacity={0.16} />
            ) : null}
            {overlayArea && overlay ? (
              <path d={overlayArea} fill={overlay.color} opacity={0.16} />
            ) : null}
            {areaPath && !overlay ? (
              <path d={areaPath} fill={def.color} opacity={0.16} />
            ) : null}
            {!overlay
              ? areaSegs.map((d) => (
                  <path
                    key={`area-seg-${d.slice(0, 48)}`}
                    d={d}
                    fill={def.color}
                    opacity={0.16}
                  />
                ))
              : null}
            {avgY != null ? (
              <line
                x1={PAD.l}
                x2={CHART_W - PAD.r}
                y1={avgY}
                y2={avgY}
                stroke="var(--color-text)"
                strokeOpacity={0.45}
                strokeWidth={1.25}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {def.kind === 'hr-area' && !overlay
              ? hrSegs.map((s) => (
                  <path
                    key={`${s.color}-${s.d.slice(0, 24)}`}
                    d={s.d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              : null}
            {def.kind === 'scatter' && dynSegs.length
              ? dynSegs.map((s) => (
                  <path
                    key={`${s.color}-${s.d.slice(0, 24)}`}
                    d={s.d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    opacity={0.9}
                  />
                ))
              : null}
            {(def.kind === 'area' || primaryLine) &&
            (primaryLine || linePath) ? (
              <path
                d={primaryLine || linePath}
                fill="none"
                stroke={def.color}
                strokeWidth={overlay && !overlayIsArea ? 1.5 : 2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={overlay && !overlayIsArea ? 0.85 : 1}
              />
            ) : null}
            {overlayLine && overlay ? (
              <path
                d={overlayLine}
                fill="none"
                stroke={overlay.color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {bestIndex != null && has(ys[bestIndex]) ? (
              <circle
                cx={geom.px(xs[bestIndex])}
                cy={geom.py(ys[bestIndex] as number)}
                r={4}
                fill={def.color}
                stroke="white"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {hover != null ? (
              <line
                x1={geom.px(xs[hover])}
                x2={geom.px(xs[hover])}
                y1={PAD.t}
                y2={PAD.t + geom.ih}
                stroke="var(--color-text)"
                strokeOpacity={0.35}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          {/* HTML dots stay circular under preserveAspectRatio=none; x uses same viewBox fraction as SVG. */}
          {def.kind === 'scatter'
            ? dots.map((d) => (
                <span
                  key={`dot-${d.color}-${d.x.toFixed(2)}-${d.y.toFixed(2)}`}
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${(d.x / CHART_W) * 100}%`,
                    top: `${(d.y / CHART_H) * 100}%`,
                    background: d.color,
                    opacity: 0.92,
                  }}
                />
              ))
            : null}
          {hover != null && has(hv) ? (
            <span
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                left: `${(geom.px(xs[hover]) / CHART_W) * 100}%`,
                top: `${(geom.py(hv) / CHART_H) * 100}%`,
                background:
                  (def.dynamicsMetric &&
                    dynamicsBandColor(def.dynamicsMetric, hv)) ||
                  def.color,
              }}
            />
          ) : null}
        </div>
        {overlay && ogeom ? (
          <div className="relative">
            {ogeom.ticks.map((tick) => (
              <span
                key={`oy-${tick.label}`}
                className="metric absolute left-0 -translate-y-1/2 text-[10px] leading-none text-[var(--color-muted)]"
                style={{
                  top: `${(tick.y / CHART_H) * 100}%`,
                  color: overlay.color,
                }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className={`mt-1 grid gap-x-1.5 ${overlay ? 'grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]' : 'grid-cols-[2.5rem_minmax(0,1fr)]'}`}
      >
        <div />
        <div className="relative mt-1 h-3.5">
          {geom.xTicks.map((tick) => {
            const frac = tick.x / CHART_W;
            const edge = frac < 0.06 ? 'start' : frac > 0.94 ? 'end' : 'mid';
            return (
              <span
                key={`x-${tick.x}`}
                className={`metric absolute top-0 text-[10px] leading-none whitespace-nowrap text-[var(--color-muted)] ${
                  edge === 'end'
                    ? '-translate-x-full'
                    : edge === 'mid'
                      ? '-translate-x-1/2'
                      : ''
                }`}
                style={{ left: `${frac * 100}%` }}
              >
                {tick.label}
              </span>
            );
          })}
        </div>
        {overlay ? <div /> : null}
      </div>
      {compareChips}
      {footer ? (
        <div className="mt-3 border-t border-[var(--color-border)]/70 pt-3">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function ChartStack({ data, tr }: { data: RunSplits; tr: Tr }) {
  const base = data.chart;
  const [liveHover, setLiveHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const hover = liveHover ?? pinned;
  const clearPin = useCallback(() => {
    setPinned(null);
    setLiveHover(null);
  }, []);
  const coarse = useCoarsePointer();
  useEffect(() => {
    if (hover == null) return;
    const onDocPointerDown = (e: globalThis.PointerEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest('[data-run-metric-card]')) {
        return;
      }
      clearPin();
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [hover, clearPin]);
  const [axis, setAxis] = useState<'distance' | 'time'>('distance');
  const [compareOn, setCompareOn] = useState(false);
  const [primaryKey, setPrimaryKey] = useState('pace');
  const [overlayKey, setOverlayKey] = useState('hr');
  const [overlayIsArea, setOverlayIsArea] = useState(false);
  const [hrStyle, setHrStyle] = useState<HrDrawStyle>('fill');
  const [paceVariant, setPaceVariant] = useState<PaceVariant>('instant');
  const chart = useMemo(() => (base ? enrichChart(base) : null), [base]);
  const s = data.summary;

  const paceSeries = useMemo(() => {
    if (!chart) return [];
    const instant = chart.pace ?? [];
    if (paceVariant === 'lap') {
      return lapAveragePaceSeries(chart.d, instant, data.laps);
    }
    if (paceVariant === 'gap') {
      return gradeAdjustedPaceSeries(chart.d, instant, chart.alt);
    }
    return instant;
  }, [chart, data.laps, paceVariant]);

  const movingPace = useMemo(() => movingAveragePace(paceSeries), [paceSeries]);
  const bestIdx = useMemo(() => bestPaceIndex(paceSeries), [paceSeries]);

  if (!chart || chart.d.length < 2) return null;
  const xs = chartAxis(chart, axis);
  const cadAvg = cadenceChartAvg(chart.cad) ?? s.cadence_avg;
  const powerSeries = powerSeriesWithGaps(chart.power);

  const defs: TrendDef[] = [
    {
      key: 'pace',
      title:
        paceVariant === 'gap'
          ? tr('坡度调整配速（估算）', 'Grade-adj. pace (est.)')
          : paceVariant === 'lap'
            ? tr('单圈配速', 'Lap pace')
            : tr('配速', 'Pace'),
      unit: '/km',
      color: C.pace,
      kind: 'area',
      invert: true,
      format: (v) => formatPaceSeconds(v),
      avg: s.pace,
      max: s.best_pace,
      extra: movingPace,
      avgLabel: tr('平均', 'Avg'),
      maxLabel: tr('最快', 'Best'),
      extraLabel: tr('移动平均', 'Moving avg'),
      series: paceSeries,
      helpKey: paceVariant === 'gap' ? 'gap' : undefined,
    },
    {
      key: 'hr',
      title: tr('心率', 'Heart rate'),
      unit: 'bpm',
      color: C.hr,
      kind: 'hr-area',
      format: (v) => v.toFixed(0),
      avg: s.hr_avg,
      max: s.hr_max,
      avgLabel: tr('平均', 'Avg'),
      maxLabel: tr('最大', 'Max'),
      series: chart.hr ?? [],
    },
    {
      key: 'power',
      title: tr('功率', 'Power'),
      unit: 'W',
      color: C.power,
      kind: 'area',
      format: (v) => v.toFixed(0),
      avg: s.power_avg,
      max: s.power_max,
      extra: s.normalized_power,
      avgLabel: tr('平均', 'Avg'),
      maxLabel: tr('最大', 'Max'),
      extraLabel: tr('归一化', 'NP'),
      series: powerSeries,
      helpKey: 'power',
    },
    {
      key: 'cad',
      title: tr('步频', 'Cadence'),
      unit: 'spm',
      color: C.cad,
      kind: 'scatter',
      format: (v) => v.toFixed(0),
      avg: cadAvg,
      max: cadenceChipMax(s.cadence_max, chart.cad),
      avgLabel: tr('平均', 'Avg'),
      maxLabel: tr('最大', 'Max'),
      series: chart.cad ?? [],
      helpKey: 'cadence',
      dynamicsMetric: 'cadence',
      meanColor: dynamicsBandColor('cadence', cadAvg),
    },
    {
      key: 'stride',
      title: tr('步幅', 'Stride length'),
      unit: 'm',
      color: C.stride,
      kind: 'scatter',
      format: (v) => v.toFixed(2),
      avg: s.stride_length,
      avgLabel: tr('平均', 'Avg'),
      series: chart.stride ?? [],
      helpKey: 'stride',
    },
    {
      key: 'alt',
      title: tr('爬升', 'Ascent'),
      unit: 'm',
      color: '#22c55e',
      kind: 'area',
      format: (v) => v.toFixed(0),
      avg: s.elev_gain,
      max: s.elev_loss,
      extra: seriesMax(chart.alt),
      avgLabel: tr('爬升', 'Gain'),
      maxLabel: tr('下降', 'Loss'),
      extraLabel: tr('最高海拔', 'Max elev.'),
      series: chart.alt ?? [],
    },
    {
      key: 'vo',
      title: tr('垂直振幅', 'Vertical oscillation'),
      unit: 'cm',
      color: C.vo,
      kind: 'scatter',
      format: (v) => v.toFixed(1),
      avg: s.vertical_oscillation,
      avgLabel: tr('平均', 'Avg'),
      series: chart.vo ?? [],
      helpKey: 'vo',
      dynamicsMetric: 'vo',
      meanColor: dynamicsBandColor('vo', s.vertical_oscillation),
    },
    {
      key: 'vr',
      title: tr('垂直步幅比', 'Vertical ratio'),
      unit: '%',
      color: C.vr,
      kind: 'scatter',
      format: (v) => v.toFixed(1),
      avg: s.vertical_ratio,
      avgLabel: tr('平均', 'Avg'),
      series: chart.vr ?? [],
      helpKey: 'vr',
      dynamicsMetric: 'vr',
      meanColor: dynamicsBandColor('vr', s.vertical_ratio),
    },
    {
      key: 'gct',
      title: tr('触地时间', 'Ground contact time'),
      unit: 'ms',
      color: C.gct,
      kind: 'scatter',
      format: (v) => v.toFixed(0),
      avg: s.ground_contact_time,
      avgLabel: tr('平均', 'Avg'),
      series: chart.gct ?? [],
      helpKey: 'gct',
      dynamicsMetric: 'gct',
      meanColor: dynamicsBandColor('gct', s.ground_contact_time),
    },
  ];
  const shown = defs.filter((d) => d.series.some((v) => has(v)));
  const byKey = Object.fromEntries(shown.map((d) => [d.key, d])) as Record<
    string,
    TrendDef
  >;

  const paceZones =
    data.zones?.pace ??
    paceZonesFromChart(chart.pace, chart.t, thresholdPaceFromVo2max(s.vo2max));
  const garminCad = cadenceGarminZonesFromChart(chart.cad, chart.t);
  const cadZones = garminCad
    ? {
        seconds: garminCad.seconds,
        high_boundary: null,
        calc_type: 'garmin_percentile_cadence',
      }
    : cadenceZonesFromChart(chart.cad, chart.t);

  const hrResolved = resolveHrZones({
    fit: data.zones?.hr,
    activityMaxHr: s.hr_max,
    analysis: ANALYSIS_HR_ZONES,
    configLthr: ANALYSIS_CONFIG_LTHR,
  });
  const powerZone = resolvePowerZones(data.zones?.power);

  const enableCompare = () => {
    const keys = shown.map((d) => d.key);
    let primary = keys.includes(primaryKey) ? primaryKey : keys[0];
    let overlay =
      keys.includes(overlayKey) && overlayKey !== primary
        ? overlayKey
        : (keys.find((k) => k !== primary && k === 'hr') ??
          keys.find((k) => k !== primary) ??
          primary);
    if (overlay === primary && keys.length > 1) {
      overlay = keys.find((k) => k !== primary) ?? primary;
    }
    setPrimaryKey(primary);
    setOverlayKey(overlay);
    setOverlayIsArea(false);
    setCompareOn(true);
  };

  const comparePrimary = byKey[primaryKey] ?? shown[0] ?? null;
  const compareOverlay =
    compareOn &&
    comparePrimary &&
    byKey[overlayKey] &&
    overlayKey !== primaryKey
      ? byKey[overlayKey]
      : null;

  const chipClass = (active: boolean) =>
    `cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
      active
        ? 'border-transparent bg-[var(--color-sunken)] font-medium text-[var(--color-text)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
    }`;

  return (
    <div className="space-y-3">
      <MotionStatusBar data={data} tr={tr} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-semibold">{tr('图表', 'Charts')}</p>
          <button
            type="button"
            aria-pressed={compareOn}
            onClick={() => (compareOn ? setCompareOn(false) : enableCompare())}
            className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors ${
              compareOn
                ? 'border-transparent bg-[var(--color-sunken)] font-medium text-[var(--color-text)]'
                : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {tr('对比', 'Compare')}
          </button>
        </div>
        <div className="flex rounded-full bg-[var(--color-sunken)] p-0.5 text-[11px]">
          {(
            [
              ['distance', tr('距离', 'Distance')],
              ['time', tr('时间', 'Time')],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={axis === m}
              onClick={() => setAxis(m)}
              className={`min-h-11 cursor-pointer rounded-full px-3.5 py-2 transition-colors md:min-h-0 md:px-3 md:py-1 ${
                axis === m
                  ? 'bg-[var(--color-card)] font-medium text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {compareOn && comparePrimary ? (
        <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
                {tr('主指标', 'Primary')}
              </span>
              {shown.map((x) => (
                <button
                  key={`p-${x.key}`}
                  type="button"
                  aria-pressed={primaryKey === x.key}
                  disabled={x.key === overlayKey}
                  onClick={() => {
                    setPrimaryKey(x.key);
                    setOverlayIsArea(false);
                  }}
                  className={`${chipClass(primaryKey === x.key)} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {x.title}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
                {tr('叠加', 'Overlay')}
              </span>
              {shown.map((x) => (
                <button
                  key={`o-${x.key}`}
                  type="button"
                  aria-pressed={overlayKey === x.key}
                  disabled={x.key === primaryKey}
                  onClick={() => {
                    setOverlayKey(x.key);
                    setOverlayIsArea(false);
                  }}
                  className={`${chipClass(overlayKey === x.key)} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {x.title}
                </button>
              ))}
            </div>
          </div>
          {compareOverlay ? (
            <MetricCard
              tr={tr}
              def={comparePrimary}
              xs={xs}
              mode={axis}
              hover={hover}
              onHover={setLiveHover}
              onPin={setPinned}
              coarse={coarse}
              prominent
              overlay={compareOverlay}
              overlayIsArea={overlayIsArea}
              onSwapOverlay={() => setOverlayIsArea((v) => !v)}
              hrDrawStyle={comparePrimary.key === 'hr' ? hrStyle : 'fill'}
              bestIndex={comparePrimary.key === 'pace' ? bestIdx : null}
              zoneBounds={
                comparePrimary.kind === 'hr-area'
                  ? hrResolved?.zone.high_boundary
                  : null
              }
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-x-8 gap-y-6 @min-[48rem]:grid-cols-2">
        {shown.map((d) => {
          const isPace = d.key === 'pace';
          const isHr = d.key === 'hr';
          return (
            <div
              key={d.key}
              className={
                isPace || isHr
                  ? 'border-t border-[var(--color-border)] pt-4 @min-[48rem]:col-span-2'
                  : 'border-t border-[var(--color-border)] pt-4'
              }
            >
              <MetricCard
                tr={tr}
                def={d}
                xs={xs}
                mode={axis}
                hover={hover}
                onHover={setLiveHover}
                onPin={setPinned}
                coarse={coarse}
                prominent={isPace || isHr}
                hrDrawStyle={isHr ? hrStyle : 'fill'}
                bestIndex={isPace ? bestIdx : null}
                zoneBounds={
                  d.kind === 'hr-area' ? hrResolved?.zone.high_boundary : null
                }
                titleNode={
                  isPace ? (
                    <>
                      <label className="sr-only" htmlFor="pace-variant">
                        {tr('配速变体', 'Pace variant')}
                      </label>
                      <select
                        id="pace-variant"
                        value={paceVariant}
                        onChange={(e) =>
                          setPaceVariant(e.target.value as PaceVariant)
                        }
                        className="max-w-[min(100%,16rem)] cursor-pointer appearance-none rounded-md border-0 bg-transparent py-0 pr-5 text-[13px] font-semibold text-[var(--color-text)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border)]"
                        style={{
                          backgroundImage:
                            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 0.15rem center',
                        }}
                      >
                        <option value="instant">{tr('配速', 'Pace')}</option>
                        <option value="lap">
                          {tr('单圈配速', 'Lap pace')}
                        </option>
                        <option value="gap">
                          {tr('坡度调整配速（估算）', 'Grade-adj. pace (est.)')}
                        </option>
                      </select>
                    </>
                  ) : undefined
                }
                titleAddon={
                  isHr ? (
                    <span className="ml-0.5 inline-flex flex-wrap gap-1 font-normal">
                      {(
                        [
                          ['fill', tr('面积', 'Filled')],
                          ['zones', tr('区间折线', 'Zone line')],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={hrStyle === k}
                          onClick={() => setHrStyle(k)}
                          className={`cursor-pointer rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                            hrStyle === k
                              ? 'bg-[var(--color-sunken)] font-medium text-[var(--color-text)]'
                              : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  ) : null
                }
                footer={
                  d.key === 'pace' && paceZones ? (
                    <ZoneTable
                      title={tr('配速区间', 'Pace zones')}
                      zone={paceZones}
                      colors={[...ZONE_COLORS]}
                      unit="/km"
                      tr={tr}
                      labels={paceZoneLabels(paceZones)}
                    />
                  ) : d.key === 'hr' && hrResolved ? (
                    <ZoneTable
                      title={
                        hrResolved.estimated
                          ? tr('心率区间（估算）', 'HR zones (est.)')
                          : tr('心率区间', 'HR zones')
                      }
                      zone={hrResolved.zone}
                      colors={[...ZONE_COLORS]}
                      unit="bpm"
                      tr={tr}
                    />
                  ) : d.key === 'cad' && cadZones ? (
                    <ZoneTable
                      title={tr('步频区间', 'Cadence zones')}
                      zone={cadZones}
                      colors={[...DYNAMICS_BAND_COLORS]}
                      unit="spm"
                      tr={tr}
                      labels={garminCad?.labels ?? cadenceZoneLabels()}
                    />
                  ) : d.key === 'power' && powerZone ? (
                    <ZoneTable
                      title={tr('功率区间', 'Power zones')}
                      zone={powerZone}
                      colors={[...ZONE_COLORS]}
                      unit="W"
                      tr={tr}
                    />
                  ) : null
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
