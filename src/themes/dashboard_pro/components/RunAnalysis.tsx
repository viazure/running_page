import { Suspense, use, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bookmarkFabClass, desktopCenteredFabClass } from './MapDockFab';
import type { Activity } from '@/types';
import { useLocale } from '@/hooks/useLocale';
import type { Locale } from '@/core/i18n';
import { resolveActivityTitle } from '@/core/privacyTitles';
import {
  formatClock,
  formatPaceSeconds,
  loadSplits,
  loadSplitsIndex,
  type RunSplits,
  type SplitRow,
} from '@/core/splits';
import { ChartStack } from './runAnalysis/AnalysisCharts';
import { ChipScrollRow } from './ChipScrollRow';

type N = number | null | undefined;
type Tr = (zh: string, en: string) => string;

const TE_GRADIENT =
  'linear-gradient(90deg,#3b82f6 0%,#22c55e 35%,#eab308 65%,#f97316 100%)';

const SHEET_MS = 200;

const has = (v: N): v is number => v != null && Number.isFinite(v);
const fmt = (v: N, d = 0) => (has(v) ? v.toFixed(d) : '--');

function useTr(): Tr {
  const { locale } = useLocale();
  return (zh, en) => (locale === 'zh' ? zh : en);
}

// ---------------------------------------------------------------- detail metric grid (value above label)
function MetricChip({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="min-w-0 text-center">
      <p className="metric text-[17px] leading-none font-semibold @min-[40rem]:text-[19px]">
        {value}
        {unit ? (
          <span className="ml-1 text-[11px] font-normal text-[var(--color-muted)]">
            {unit}
          </span>
        ) : null}
      </p>
      <p className="mt-1.5 text-[11px] leading-none text-[var(--color-muted)]">
        {label}
      </p>
    </div>
  );
}

function MetricGrid({ data, tr }: { data: RunSplits; tr: Tr }) {
  const s = data.summary;
  // Same order on phone and desktop. TE is a separate block — no TE chip here.
  // Max / descent stay on climb charts, not in this overview.
  type Cell = {
    key: string;
    label: string;
    value: string;
    unit?: string;
    show: boolean;
  };
  const cells: Cell[] = [
    {
      key: 'cal',
      label: tr('卡路里', 'Calories'),
      value: fmt(s.calories),
      unit: 'kcal',
      show: has(s.calories),
    },
    {
      key: 'hr',
      label: tr('平均心率', 'Avg HR'),
      value: fmt(s.hr_avg),
      unit: 'bpm',
      show: has(s.hr_avg),
    },
    {
      key: 'cad',
      label: tr('平均步频', 'Avg cadence'),
      // Prefer chart-mean (ignore walk/stop & sensor spikes) so overview matches chart avg.
      value: fmt(
        (() => {
          const series = data.chart?.cad ?? [];
          const vals = series.filter(
            (v): v is number => has(v) && v >= 100 && v <= 220
          );
          if (vals.length) {
            return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
          }
          return s.cadence_avg;
        })()
      ),
      unit: 'spm',
      show: has(s.cadence_avg) || Boolean(data.chart?.cad?.some((v) => has(v))),
    },
    {
      key: 'elev',
      label: tr('累计爬升', 'Ascent'),
      value: fmt(s.elev_gain),
      unit: 'm',
      show: has(s.elev_gain),
    },
    {
      key: 'power',
      label: tr('平均功率', 'Avg power'),
      value: fmt(s.power_avg),
      unit: 'W',
      show: has(s.power_avg),
    },
    {
      key: 'stride',
      label: tr('平均步幅', 'Avg stride'),
      value: fmt(s.stride_length, 2),
      unit: 'm',
      show: has(s.stride_length),
    },
    {
      key: 'vo',
      label: tr('垂直振幅', 'Vert. osc.'),
      value: fmt(s.vertical_oscillation, 1),
      unit: 'cm',
      show: has(s.vertical_oscillation),
    },
    {
      key: 'gct',
      label: tr('触地时间', 'Ground contact'),
      value: fmt(s.ground_contact_time),
      unit: 'ms',
      show: has(s.ground_contact_time),
    },
    {
      key: 'load',
      label: tr('训练负荷', 'Training load'),
      value: fmt(s.training_load),
      show: has(s.training_load),
    },
    {
      key: 'temp',
      label: tr('气温', 'Air temp'),
      value: fmt(s.temperature),
      unit: '°C',
      show: s.temperature_source === 'weather' && has(s.temperature),
    },
  ].filter((c) => c.show);
  if (!cells.length) return null;
  const rows = Math.ceil(cells.length / 3);
  return (
    <div className="ra-metric-grid">
      {cells.map((c, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const ruled = row < rows - 1;
        const vdiv = col < 2;
        return (
          <div
            key={c.key}
            className={[
              'ra-metric-cell px-1.5 py-2.5 @min-[40rem]:px-3 @min-[40rem]:py-3.5',
              ruled ? 'ra-metric-cell--ruled' : null,
              vdiv ? 'ra-metric-cell--vdiv' : null,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <MetricChip label={c.label} value={c.value} unit={c.unit} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- TE scale (0–5)
function TeScaleRow({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12px]">
        <span className="text-[var(--color-muted)]">{label}</span>
        <span className="metric font-semibold">{value.toFixed(1)}</span>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--color-sunken)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: '100%', background: TE_GRADIENT, opacity: 0.35 }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--color-text)] shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] text-[var(--color-muted)]">
        <span>0</span>
        <span>5.0</span>
      </div>
    </div>
  );
}

function TeScale({
  aerobic,
  anaerobic,
  tr,
}: {
  aerobic: N;
  anaerobic: N;
  tr: Tr;
}) {
  if (!has(aerobic) && !has(anaerobic)) return null;
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold">
        {tr('训练效果', 'Training effect')}
      </p>
      <div className="grid gap-3 @min-[40rem]:grid-cols-2 @min-[40rem]:gap-8">
        {has(aerobic) ? (
          <TeScaleRow label={tr('有氧', 'Aerobic')} value={aerobic} />
        ) : null}
        {has(anaerobic) ? (
          <TeScaleRow label={tr('无氧', 'Anaerobic')} value={anaerobic} />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- splits (Garmin-like)
function Delta({ cur, prev, invert }: { cur: N; prev: N; invert?: boolean }) {
  if (!has(cur) || !has(prev) || prev === 0) return null;
  const better = invert ? cur < prev : cur > prev;
  const worse = invert ? cur > prev : cur < prev;
  if (!better && !worse) return null;
  return (
    <span
      className={`ml-0.5 text-[9px] ${better ? 'text-emerald-500' : 'text-rose-500'}`}
      aria-hidden
    >
      {better ? '▲' : '▼'}
    </span>
  );
}

function SplitsBlock({ data, tr }: { data: RunSplits; tr: Tr }) {
  const hasLaps = data.laps.length > 1;
  const [mode, setMode] = useState<'km' | 'laps'>(
    data.splits.length ? 'km' : 'laps'
  );
  const rows = mode === 'km' ? data.splits : data.laps;
  if (!rows.length) return null;

  const paces = rows
    .filter((r) => !r.partial && has(r.pace) && (r.distance ?? 0) >= 200)
    .map((r) => r.pace as number);
  const fast = paces.length ? Math.min(...paces) : 0;
  const slow = paces.length ? Math.max(...paces) : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">
          {mode === 'km' ? tr('分段', 'Splits') : tr('设备圈', 'Device laps')}
        </p>
        {hasLaps && data.splits.length ? (
          <div className="flex rounded-full bg-[var(--color-sunken)] p-0.5 text-[11px]">
            {(['km', 'laps'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-11 cursor-pointer rounded-full px-3.5 py-2 transition-colors md:min-h-0 md:px-3 md:py-1 ${
                  mode === m
                    ? 'bg-[var(--color-card)] font-medium text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {m === 'km'
                  ? tr('每公里', 'Per km')
                  : tr('设备圈', 'Device laps')}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Garmin-style horizontal pace bars + table. Wide panel: side by side. */}
      <div className="@min-[48rem]:grid @min-[48rem]:grid-cols-2 @min-[48rem]:items-start @min-[48rem]:gap-6">
        <div className="mb-3 space-y-1 @min-[48rem]:mb-0 @min-[48rem]:space-y-0">
          {/* Shared h-8 row box with table so data rows stay vertically aligned. */}
          <div
            aria-hidden
            className="box-border hidden h-8 items-center border-b border-[var(--color-border)] @min-[48rem]:flex"
          >
            <span className="invisible text-[12px] font-medium">#</span>
          </div>
          {rows.map((r) => {
            const p = r.pace ?? 0;
            const tiny = (r.distance ?? 0) < 200;
            const ratio =
              slow > fast && has(r.pace)
                ? Math.max(0, Math.min(1, 1 - (p - fast) / (slow - fast)))
                : 0.5;
            const isFast = has(r.pace) && p === fast && !r.partial && !tiny;
            return (
              <div
                key={`bar-${mode}-${r.index}`}
                className={`box-border flex h-8 items-center gap-2 border-b border-transparent text-[12px] @min-[48rem]:border-[var(--color-border)]/50 ${tiny ? 'opacity-50' : ''}`}
              >
                <span className="metric w-4 shrink-0 text-[var(--color-muted)]">
                  {r.index}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded-sm bg-[var(--color-sunken)]/80">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${25 + ratio * 75}%`,
                      backgroundColor: 'var(--color-accent)',
                      opacity: 0.35 + ratio * 0.55,
                    }}
                  />
                </div>
                <span
                  className={`metric w-12 shrink-0 text-right ${isFast ? 'font-semibold text-[var(--color-run)]' : ''}`}
                >
                  {formatPaceSeconds(r.pace)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="-mx-0.5 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse text-[12px]">
            <thead>
              <tr className="box-border h-8 border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                <th className="h-8 py-0 pr-2 align-middle font-medium">#</th>
                <th className="h-8 py-0 pr-2 align-middle font-medium whitespace-nowrap">
                  {tr('距离', 'Dist')}
                </th>
                <th className="h-8 py-0 pr-2 align-middle font-medium whitespace-nowrap">
                  {tr('时间', 'Time')}
                </th>
                <th className="h-8 py-0 pr-2 align-middle font-medium whitespace-nowrap">
                  {tr('配速', 'Pace')}
                </th>
                <th className="h-8 py-0 pr-2 align-middle font-medium whitespace-nowrap">
                  {tr('心率', 'HR')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const prev: SplitRow | undefined =
                  idx > 0 ? rows[idx - 1] : undefined;
                const tiny = (r.distance ?? 0) < 200;
                const isFast =
                  has(r.pace) && r.pace === fast && !r.partial && !tiny;
                return (
                  <tr
                    key={`${mode}-${r.index}`}
                    className={`box-border h-8 border-b border-[var(--color-border)]/50 ${tiny ? 'opacity-50' : ''}`}
                  >
                    <td className="metric h-8 py-0 pr-2 align-middle text-[var(--color-muted)]">
                      {r.index}
                    </td>
                    <td className="metric h-8 py-0 pr-2 align-middle whitespace-nowrap">
                      {((r.distance ?? 0) / 1000).toFixed(2)}
                    </td>
                    <td className="metric h-8 py-0 pr-2 align-middle whitespace-nowrap">
                      {formatClock(r.time)}
                    </td>
                    <td
                      className={`metric h-8 py-0 pr-2 align-middle whitespace-nowrap ${isFast ? 'font-semibold text-[var(--color-accent)]' : ''}`}
                    >
                      {formatPaceSeconds(r.pace)}
                      <Delta cur={r.pace} prev={prev?.pace} invert />
                    </td>
                    <td className="metric h-8 py-0 pr-2 align-middle whitespace-nowrap">
                      {fmt(r.hr_avg)}
                      <Delta cur={r.hr_avg} prev={prev?.hr_avg} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stack
function PrimaryStats({ data, tr }: { data: RunSplits; tr: Tr }) {
  const s = data.summary;
  const cells = [
    {
      key: 'dist',
      label: tr('距离', 'Distance'),
      value: has(s.distance) ? (s.distance / 1000).toFixed(2) : '--',
      unit: 'km',
    },
    {
      key: 'time',
      label: tr('用时', 'Time'),
      value: formatClock(s.time),
    },
    {
      key: 'pace',
      label: tr('平均配速', 'Avg pace'),
      value: formatPaceSeconds(s.pace),
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 @min-[40rem]:gap-10">
      {cells.map((c) => (
        <div key={c.key} className="min-w-0 text-center">
          <p className="metric text-[1.65rem] leading-none font-bold tracking-tight @min-[40rem]:text-[2.125rem]">
            {c.value}
            {c.unit ? (
              <span className="ml-1 text-xs font-medium text-[var(--color-muted)]">
                {c.unit}
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 text-[11px] leading-none text-[var(--color-muted)] @min-[40rem]:mt-2">
            {c.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function AnalysisBody({ data }: { data: RunSplits }) {
  const tr = useTr();
  const s = data.summary;
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    const scroller = document.querySelector('.run-analysis-scroll');
    if (!el || !scroller) return;
    const sticky = scroller.querySelector(
      '.ra-anchor-bar'
    ) as HTMLElement | null;
    const offset = (sticky?.offsetHeight ?? 0) + 12;
    const top =
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      offset;
    scroller.scrollTo({ top, behavior: 'smooth' });
  };
  // Chip visibility matches ChartStack / SplitsBlock: hide when no target.
  const chart = data.chart;
  const chartUsable = Boolean(chart && chart.d.length >= 2);
  const seriesHas = (arr?: (number | null)[] | null) =>
    Boolean(arr?.some((v) => has(v)));
  const canShowSplits = data.splits.length > 0 || data.laps.length > 0;
  const canShowForm =
    chartUsable &&
    (seriesHas(chart?.vo) ||
      seriesHas(chart?.vr) ||
      seriesHas(chart?.gct) ||
      // Derived stride (same as AnalysisCharts enrichChart).
      Boolean(
        chart?.pace &&
        chart?.cad &&
        chart.pace.some(
          (p, i) => has(p) && has(chart.cad![i]) && p > 0 && chart.cad![i]! > 0
        )
      ));
  const anchors: { id: string; label: string; show?: boolean }[] = [
    { id: 'ra-overview', label: tr('概览', 'Overview') },
    { id: 'ra-splits', label: tr('分段', 'Splits'), show: canShowSplits },
    {
      id: 'ra-pace',
      label: tr('配速', 'Pace'),
      show: chartUsable && seriesHas(chart?.pace),
    },
    {
      id: 'ra-hr',
      label: tr('心率', 'HR'),
      show: chartUsable && seriesHas(chart?.hr),
    },
    {
      id: 'ra-power',
      label: tr('功率', 'Power'),
      show: chartUsable && seriesHas(chart?.power),
    },
    {
      id: 'ra-cadence',
      label: tr('步频', 'Cadence'),
      show: chartUsable && seriesHas(chart?.cad),
    },
    { id: 'ra-form', label: tr('形态', 'Form'), show: canShowForm },
  ].filter((a) => a.show !== false);

  return (
    <div>
      <div className="ra-anchor-bar sticky top-0 z-10 -mx-4 border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 md:-mx-6 md:px-6">
        <ChipScrollRow contentClassName="gap-1.5" fadeFrom="var(--color-card)">
          {anchors.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => scrollTo(a.id)}
              className="shrink-0 cursor-pointer rounded-full border border-[var(--color-border)] bg-[var(--color-sunken)] px-3 py-1 text-[11px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              {a.label}
            </button>
          ))}
        </ChipScrollRow>
      </div>

      <div className="space-y-4 pt-3">
        <div id="ra-overview">
          <MetricGrid data={data} tr={tr} />
        </div>

        {(has(s.aerobic_te) || has(s.anaerobic_te)) && (
          <div className="pt-1">
            <TeScale
              aerobic={s.aerobic_te}
              anaerobic={s.anaerobic_te}
              tr={tr}
            />
          </div>
        )}

        {canShowSplits ? (
          <div
            id="ra-splits"
            className="border-t border-[var(--color-border)] pt-4"
          >
            <SplitsBlock data={data} tr={tr} />
          </div>
        ) : null}

        {data.chart ? (
          <div className="border-t border-[var(--color-border)] pt-4">
            <ChartStack data={data} tr={tr} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CloseButton({
  onClose,
  label,
}: {
  onClose: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="grid size-11 cursor-pointer place-items-center text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] md:size-8"
    >
      <svg
        className="size-5 md:size-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  );
}

function Pulse({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--color-sunken)] ${className}`}
    />
  );
}

function AnalysisSkeleton({
  activity,
  className,
  onClose,
  anonymousTitles = false,
}: {
  activity: Activity;
  className?: string;
  onClose?: () => void;
  anonymousTitles?: boolean;
}) {
  const tr = useTr();
  const { locale } = useLocale();
  const title = resolveActivityTitle(activity, locale, anonymousTitles);
  const date = activityDateLabel(activity, locale);
  return (
    <div
      className={`card flex max-h-full min-h-0 flex-auto flex-col overflow-hidden ${className ?? ''}`}
    >
      <div className="sticky top-0 z-20 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 pt-2 pb-3 md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 py-1.5">
            <h2
              className="truncate text-base font-bold md:text-lg"
              title={title}
            >
              {title}
            </h2>
            {date ? (
              <p className="mt-1 text-[12px] text-pretty text-[var(--color-muted)]">
                {date}
              </p>
            ) : (
              <Pulse className="mt-1 h-3 w-36" />
            )}
          </div>
          {onClose ? (
            <CloseButton onClose={onClose} label={tr('关闭', 'Close')} />
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="min-w-0 space-y-2 text-center">
              <Pulse className="mx-auto h-7 w-16" />
              <Pulse className="mx-auto h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-auto px-4 py-3 md:px-6 md:py-4">
        <div className="grid grid-cols-3 gap-x-3 gap-y-3.5 md:gap-x-8">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="min-w-0 space-y-2">
              <Pulse className="h-5 w-14" />
              <Pulse className="h-3 w-12" />
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <Pulse className="h-3 w-16" />
          <Pulse className="h-2 w-full rounded-full" />
          <Pulse className="h-2 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

function activityDateLabel(activity: Activity, locale: Locale): string {
  const raw = activity.start_date_local || activity.start_date || '';
  const d = raw.slice(0, 10);
  if (!d) return '';
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString(
      locale === 'zh' ? 'zh-CN' : 'en-US',
      { year: 'numeric', month: 'short', day: 'numeric' }
    );
  } catch {
    return d;
  }
}

function Header({
  activity,
  onClose,
  tr,
  data,
  anonymousTitles = false,
}: {
  activity: Activity;
  onClose?: () => void;
  tr: Tr;
  data?: RunSplits | null;
  anonymousTitles?: boolean;
}) {
  const { locale } = useLocale();
  const title = resolveActivityTitle(activity, locale, anonymousTitles);
  const date = activityDateLabel(activity, locale);
  return (
    <div className="sticky top-0 z-20 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 pt-2 pb-3 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 py-1.5">
          <h2 className="truncate text-base font-bold md:text-lg" title={title}>
            {title}
          </h2>
          {date ? (
            <p className="mt-1 text-[12px] text-pretty text-[var(--color-muted)]">
              {date}
            </p>
          ) : null}
        </div>
        {onClose ? (
          <CloseButton onClose={onClose} label={tr('关闭', 'Close')} />
        ) : null}
      </div>
      {data ? (
        <div className="@container mt-3">
          <PrimaryStats data={data} tr={tr} />
        </div>
      ) : null}
    </div>
  );
}

function Loaded({
  activity,
  promise,
  className,
  onClose,
  anonymousTitles = false,
}: {
  activity: Activity;
  promise: Promise<RunSplits | null>;
  className?: string;
  onClose?: () => void;
  anonymousTitles?: boolean;
}) {
  const data = use(promise);
  const tr = useTr();
  if (!data) return null;
  return (
    <div
      className={`card flex max-h-full min-h-0 flex-auto flex-col overflow-hidden ${className ?? ''}`}
    >
      <Header
        activity={activity}
        onClose={onClose}
        tr={tr}
        data={data}
        anonymousTitles={anonymousTitles}
      />
      <div className="run-analysis-scroll min-h-0 flex-auto overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="@container">
          <AnalysisBody data={data} />
        </div>
      </div>
    </div>
  );
}

export function RunAnalysis({
  activity,
  className,
  onClose,
  anonymousTitles = false,
}: {
  activity: Activity;
  className?: string;
  onClose?: () => void;
  /** When true (privacy locked + anonymous titles), hide raw activity.name */
  anonymousTitles?: boolean;
}) {
  const promise = loadSplits(activity.run_id);
  return (
    <Suspense
      fallback={
        <AnalysisSkeleton
          activity={activity}
          className={className}
          onClose={onClose}
          anonymousTitles={anonymousTitles}
        />
      }
    >
      <Loaded
        key={activity.run_id}
        activity={activity}
        promise={promise}
        className={className}
        onClose={onClose}
        anonymousTitles={anonymousTitles}
      />
    </Suspense>
  );
}

function LauncherButton({
  activity,
  index,
  onOpen,
}: {
  activity: Activity;
  index: Promise<Set<number>>;
  onOpen: () => void;
}) {
  const ids = use(index);
  const tr = useTr();
  if (!ids.has(activity.run_id)) return null;
  // Selected-state primary entry (not a map control). Portal past sticky map
  // / overflow ancestors so the FAB stays visible on mobile.
  // Mobile (<=1023px): bookmark edge-peek, bottom-right.
  // Desktop (lg+): centered pill FAB (same semantics).
  const label = (
    <>
      <svg
        className="size-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 3v18h18M7 15l4-4 3 3 5-6"
        />
      </svg>
      <span className="whitespace-nowrap">{tr('分段分析', 'Splits')}</span>
      <span className="text-[10px] opacity-80">
        {(activity.distance / 1000).toFixed(1)} km
      </span>
    </>
  );
  const bottom = { bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' };
  return createPortal(
    <>
      <button
        type="button"
        onClick={onOpen}
        style={bottom}
        className={`${bookmarkFabClass} border-[var(--color-run)] bg-[var(--color-run)] text-white lg:hidden`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onOpen}
        style={bottom}
        className={`${desktopCenteredFabClass} bg-[var(--color-run)] text-white`}
      >
        {label}
      </button>
    </>,
    document.body
  );
}

function Sheet({
  activity,
  onClose,
  anonymousTitles = false,
}: {
  activity: Activity;
  onClose: () => void;
  anonymousTitles?: boolean;
}) {
  const [phase, setPhase] = useState<'enter' | 'open' | 'leave'>('enter');
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhase('leave');
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setPhase((p) => (p === 'enter' ? 'open' : p));
      });
    });
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'leave') return;
    const t = window.setTimeout(() => onCloseRef.current(), SHEET_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const visible = phase === 'open';
  const requestClose = () => setPhase('leave');

  return (
    <div
      className={`fixed inset-0 z-[80] flex h-[100dvh] max-h-[100dvh] items-end justify-center bg-black/40 backdrop-blur-[2px] transition-opacity ease-out md:items-center md:p-6 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ transitionDuration: `${SHEET_MS}ms` }}
      onClick={requestClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92svh] w-full origin-bottom flex-col overflow-hidden rounded-t-[0.5rem] bg-[var(--color-card)] transition-[opacity,transform] ease-out md:max-h-[90svh] md:w-[min(1080px,calc(100vw-3rem))] md:origin-center md:rounded-[0.5rem] ${
          visible
            ? 'translate-y-0 scale-100 opacity-100'
            : 'translate-y-6 scale-[0.98] opacity-0 md:translate-y-2'
        }`}
        style={{ transitionDuration: `${SHEET_MS}ms` }}
        onClick={(e) => e.stopPropagation()}
      >
        <RunAnalysis
          activity={activity}
          onClose={requestClose}
          className="[--card-radius:0]"
          anonymousTitles={anonymousTitles}
        />
      </div>
    </div>
  );
}

export function RunAnalysisLauncher({
  activity,
  showFab = true,
  onOpenChange,
  anonymousTitles = false,
}: {
  activity: Activity | null;
  /** When false, hide the bottom FAB (sheet can still open if already open). */
  showFab?: boolean;
  /** Fires when the analysis sheet opens/closes (hide map-dock FAB while open). */
  onOpenChange?: (open: boolean) => void;
  /** Match list/profile privacy titles when privacy is locked. */
  anonymousTitles?: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = activity != null && openId === activity.run_id;
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  if (!activity) return null;
  return (
    <Suspense fallback={null}>
      {open ? (
        <Sheet
          activity={activity}
          onClose={() => setOpenId(null)}
          anonymousTitles={anonymousTitles}
        />
      ) : showFab ? (
        <LauncherButton
          activity={activity}
          index={loadSplitsIndex()}
          onOpen={() => setOpenId(activity.run_id)}
        />
      ) : null}
    </Suspense>
  );
}
