import { useMemo } from 'react';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '@/types';
import {
  formatDistance,
  formatDuration,
  formatPace,
} from '@/hooks/useActivities';
import { useLocale } from '@/hooks/useLocale';
import './LatestStrip.css';

interface LatestStripProps {
  activities: Activity[];
  getTitle?: (a: Activity) => string;
  onSelectActivity?: (a: Activity | null) => void;
  /** Max rows; default 3 */
  limit?: number;
}

function sportTone(type: string): string {
  if (type === 'Run') return 'var(--color-run, #c45c26)';
  if (type === 'Ride') return '#4f7ce0';
  if (type === 'Hike') return '#c98500';
  return 'var(--color-accent)';
}

function sportLabel(type: string, locale: string): string {
  if (locale !== 'zh') return type;
  if (type === 'Run') return '跑步';
  if (type === 'Ride') return '骑行';
  if (type === 'Hike') return '徒步';
  return type;
}

/** Relative day label: 今天/昨天 or MM-DD. */
function formatActivityDate(isoLocal: string, locale: string): string {
  const day = isoLocal.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterday = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
  if (day === today) return locale === 'zh' ? '今天' : 'Today';
  if (day === yesterday) return locale === 'zh' ? '昨天' : 'Yesterday';
  return day.slice(5); // MM-DD
}

function renderMiniTrack(summaryPolyline: string, size = 48): string {
  try {
    let coords = polyline.decode(summaryPolyline);
    if (coords.length < 2) return '';
    if (coords.length > 60) {
      const step = Math.ceil(coords.length / 60);
      coords = coords.filter(
        (_, i) => i % step === 0 || i === coords.length - 1
      );
    }
    const lats = coords.map((c) => c[0]);
    const lngs = coords.map((c) => c[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;
    const pad = 6;
    const scale = Math.min(
      (size - pad * 2) / lngRange,
      (size - pad * 2) / latRange
    );
    const offsetX = (size - lngRange * scale) / 2;
    const offsetY = (size - latRange * scale) / 2;
    return coords
      .map(([lat, lng]) => {
        const x = (lng - minLng) * scale + offsetX;
        const y = size - ((lat - minLat) * scale + offsetY);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  } catch {
    return '';
  }
}

export function LatestStrip({
  activities,
  getTitle,
  onSelectActivity,
  limit = 3,
}: LatestStripProps) {
  const { locale } = useLocale();
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const latest = useMemo(() => {
    return [...activities]
      .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
      .slice(0, limit);
  }, [activities, limit]);

  if (!latest.length) return null;

  return (
    <section className="latest-strip" aria-label={tr('最近活动', 'Latest')}>
      <div className="latest-strip-label">{tr('最近', 'Latest')}</div>
      <div className="latest-strip-list">
        {latest.map((a) => {
          const pts =
            a.summary_polyline && a.summary_polyline.length > 20
              ? renderMiniTrack(a.summary_polyline)
              : '';
          const title = getTitle ? getTitle(a) : a.name;
          const hasDist = a.distance > 0;
          const when = formatActivityDate(a.start_date_local, locale);
          return (
            <button
              key={a.run_id}
              type="button"
              className="latest-strip-item card"
              aria-label={`${when} ${title}`}
              onClick={() => onSelectActivity?.(a)}
            >
              <div
                className="latest-strip-glyph"
                aria-hidden
                style={{ borderColor: sportTone(a.type) }}
              >
                {pts ? (
                  <svg viewBox="0 0 48 48" className="latest-strip-svg">
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={sportTone(a.type)}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span
                    className="latest-strip-dot"
                    style={{ background: sportTone(a.type) }}
                  />
                )}
              </div>
              <div className="latest-strip-body">
                <div className="latest-strip-meta">
                  <span
                    className="latest-strip-sport"
                    style={{ color: sportTone(a.type) }}
                  >
                    {sportLabel(a.type, locale)}
                  </span>
                  <span className="latest-strip-date">{when}</span>
                </div>
                <div className="latest-strip-title">{title}</div>
                <div className="latest-strip-stats">
                  <span>
                    <b>{formatDuration(a.moving_time)}</b>
                  </span>
                  <span>
                    {hasDist ? (
                      <>
                        <b>{formatDistance(a.distance)}</b> km
                      </>
                    ) : (
                      <b>—</b>
                    )}
                  </span>
                  {hasDist && a.average_speed > 0 ? (
                    <span>
                      <b>{formatPace(a.average_speed)}</b>
                    </span>
                  ) : null}
                  {a.average_heartrate ? (
                    <span>
                      HR <b>{Math.round(a.average_heartrate)}</b>
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
