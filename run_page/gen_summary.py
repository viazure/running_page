#!/usr/bin/env python3
"""
Build cross-period aggregates for the dashboard_pro Summary page.

Reads ``src/static/activities.json`` plus ``public/splits/*.json`` and writes
``public/summary/aggregates.json`` — one compact payload the browser can consume
without downloading every per-activity split file.

Nothing here is required for the summary to work: a deployment that never runs
this script (GPX-only fork, or CI without the step) falls back to the L0/L1
analysis computed in the browser, and every deeper block hides itself.

Usage:
    python run_page/gen_summary.py
    python run_page/gen_summary.py --activities src/static/activities.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import defaultdict
from typing import Any, Iterable

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_ACTIVITIES = os.path.join(ROOT, "src", "static", "activities.json")
DEFAULT_SPLITS = os.path.join(ROOT, "public", "splits")
DEFAULT_OUT = os.path.join(ROOT, "public", "summary", "aggregates.json")

# Best-effort distances (meters) computed from per-sample streams.
# A distance only appears once a run actually covers it, so adding a target here
# is safe: short histories simply produce an empty series.
BEST_EFFORT_TARGETS = (
    ("1k", 1000),
    ("5k", 5000),
    ("10k", 10000),
    ("half", 21097.5),
    ("full", 42195),
)
# Steady-state runs only: decoupling is meaningless on intervals.
DECOUPLING_MIN_SECONDS = 30 * 60
DECOUPLING_MIN_SAMPLES = 30


def parse_moving_time(value: Any) -> float:
    """Mirror of the frontend parser for H:MM:SS / MM:SS / SS (float seconds).

    Also accepts the "N day, H:MM:SS" / "N days, H:MM:SS" shape some exporters
    emit; the frontend parser handles it, so skipping it here would make
    aggregates.json disagree with the L0 totals shown on the page.
    """
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    day_seconds = 0.0
    m = re.match(r"^(\d+)\s*days?\s*,?\s*(.*)$", s, re.IGNORECASE)
    if m:
        day_seconds = float(m.group(1)) * 86400
        s = (m.group(2) or "").strip()
        if not s:
            return day_seconds
    if "." in s:
        s = s.split(".")[0]
    parts = s.split(":")
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return 0.0
    if len(nums) == 3:
        return day_seconds + nums[0] * 3600 + nums[1] * 60 + nums[2]
    if len(nums) == 2:
        return day_seconds + nums[0] * 60 + nums[1]
    if len(nums) == 1:
        return day_seconds + nums[0]
    return 0.0


def weighted_pace(distance: float, seconds: float) -> float | None:
    if distance <= 0 or seconds <= 0:
        return None
    return seconds / distance * 1000


def rolling_best_effort(chart: dict[str, Any], target_m: float) -> int | None:
    """Fastest time (seconds) covering `target_m` anywhere in the run."""
    d = chart.get("d")
    t = chart.get("t")
    if not d or not t or len(d) != len(t) or len(d) < 2:
        return None
    target_km = target_m / 1000.0
    best: float | None = None
    j = 0
    n = len(d)
    for i in range(n):
        if j < i:
            j = i
        while j < n and (d[j] - d[i]) < target_km:
            j += 1
        if j >= n:
            break
        dt = t[j] - t[i]
        if dt > 0 and (best is None or dt < best):
            best = dt
    return int(round(best)) if best else None


def decoupling_pct(chart: dict[str, Any], duration: float) -> float | None:
    """Aerobic decoupling (Pa:HR) from pace + HR streams.

    EF = mean speed / mean HR per half; value = (EF1 - EF2) / EF1 * 100.
    Only steady efforts are meaningful, so callers filter by duration.
    """
    if duration < DECOUPLING_MIN_SECONDS:
        return None
    pace = chart.get("pace")
    hr = chart.get("hr")
    if not pace or not hr or len(pace) != len(hr):
        return None
    n = len(pace)
    if n < DECOUPLING_MIN_SAMPLES:
        return None

    def ef(lo: int, hi: int) -> float | None:
        vsum = 0.0
        hsum = 0.0
        cnt = 0
        for i in range(lo, hi):
            p = pace[i]
            h = hr[i]
            if not p or not h or p <= 0 or p > 1800 or h < 60:
                continue
            vsum += 1000.0 / p  # m/s
            hsum += h
            cnt += 1
        if cnt < 10 or hsum <= 0:
            return None
        return (vsum / cnt) / (hsum / cnt)

    mid = n // 2
    ef1 = ef(0, mid)
    ef2 = ef(mid, n)
    if not ef1 or not ef2 or ef1 <= 0:
        return None
    value = (ef1 - ef2) / ef1 * 100.0
    if not math.isfinite(value):
        return None
    return round(value, 1)


def load_activities(path: str) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("activities.json must be a JSON array")
    return data


def load_splits(splits_dir: str) -> dict[int, dict[str, Any]]:
    """run_id -> split payload. Missing directory is fine."""
    out: dict[int, dict[str, Any]] = {}
    if not os.path.isdir(splits_dir):
        return out
    for name in os.listdir(splits_dir):
        if not name.endswith(".json"):
            continue
        stem = name[:-5]
        if not stem.isdigit():
            continue
        try:
            with open(os.path.join(splits_dir, name), encoding="utf-8") as f:
                out[int(stem)] = json.load(f)
        except (OSError, ValueError):
            continue
    return out


def median(values: Iterable[float]) -> float | None:
    xs = sorted(values)
    if not xs:
        return None
    mid = len(xs) // 2
    return xs[mid] if len(xs) % 2 else (xs[mid - 1] + xs[mid]) / 2


def build(
    activities: list[dict[str, Any]], splits: dict[int, dict[str, Any]]
) -> dict[str, Any]:
    capability: dict[str, int] = defaultdict(int)
    monthly: dict[str, dict[str, Any]] = {}
    yearly: dict[str, dict[str, Any]] = {}
    load_days: dict[str, float] = defaultdict(float)
    vo2_points: list[dict[str, Any]] = []
    cadence_monthly: dict[str, list[float]] = defaultdict(list)
    gct_monthly: dict[str, list[float]] = defaultdict(list)
    decoupling_monthly: dict[str, list[float]] = defaultdict(list)
    hr_zone_monthly: dict[str, list[float]] = {}
    pace_distribution: dict[int, int] = defaultdict(int)
    hour_distribution = [0] * 24
    active_days: set[str] = set()
    daily_km: dict[str, float] = defaultdict(float)
    best_efforts: dict[str, dict[str, int]] = {
        key: {} for key, _ in BEST_EFFORT_TARGETS
    }

    runs = [a for a in activities if str(a.get("type")) == "Run"]

    for a in runs:
        date = str(a.get("start_date_local") or "")[:10]
        if len(date) < 10:
            continue
        mk = date[:7]
        yk = date[:4]
        distance = float(a.get("distance") or 0)
        seconds = parse_moving_time(a.get("moving_time"))
        active_days.add(date)
        daily_km[date] += distance / 1000.0

        m = monthly.setdefault(
            mk, {"distanceM": 0.0, "seconds": 0.0, "runs": 0, "days": set()}
        )
        m["distanceM"] += distance
        m["seconds"] += seconds
        m["runs"] += 1
        m["days"].add(date)

        y = yearly.setdefault(
            yk, {"distanceM": 0.0, "seconds": 0.0, "runs": 0, "days": set()}
        )
        y["distanceM"] += distance
        y["seconds"] += seconds
        y["runs"] += 1
        y["days"].add(date)

        if (a.get("average_heartrate") or 0) > 0:
            capability["hr"] += 1
        if a.get("elevation_gain") is not None:
            capability["elevation"] += 1

        hour = str(a.get("start_date_local") or "")[11:13]
        if hour.isdigit():
            hour_distribution[int(hour)] += 1

        pace = weighted_pace(distance, seconds)
        if pace and 180 <= pace <= 900:
            pace_distribution[int(pace // 30 * 30)] += 1

        split = splits.get(int(a.get("run_id") or 0))
        if not split:
            continue
        summary = split.get("summary") or {}

        load = summary.get("training_load")
        if isinstance(load, (int, float)) and load > 0:
            capability["trainingLoad"] += 1
            load_days[date] += float(load)

        if isinstance(summary.get("aerobic_te"), (int, float)):
            capability["aerobicTe"] += 1

        vo2 = summary.get("vo2max")
        if isinstance(vo2, (int, float)) and vo2 > 0:
            capability["vo2max"] += 1
            vo2_points.append({"date": date, "value": round(float(vo2), 1)})

        cad = summary.get("cadence_avg")
        if isinstance(cad, (int, float)) and cad > 0:
            capability["cadence"] += 1
            cadence_monthly[mk].append(float(cad))

        gct = summary.get("ground_contact_time")
        if isinstance(gct, (int, float)) and gct > 0:
            capability["groundContact"] += 1
            gct_monthly[mk].append(float(gct))

        if isinstance(summary.get("power_avg"), (int, float)):
            capability["power"] += 1

        zones = split.get("zones") or {}
        hr_zone = zones.get("hr") or {}
        seconds_in_zone = hr_zone.get("seconds")
        if seconds_in_zone:
            capability["hrZones"] += 1
            bucket = hr_zone_monthly.setdefault(mk, [0.0] * len(seconds_in_zone))
            for i, s in enumerate(seconds_in_zone):
                if i < len(bucket) and isinstance(s, (int, float)):
                    bucket[i] += float(s)
        if (zones.get("pace") or {}).get("seconds"):
            capability["paceZones"] += 1

        if split.get("splits"):
            capability["splitDetails"] += 1

        chart = split.get("chart") or {}
        if not (chart.get("d") and chart.get("t")):
            continue
        capability["streams"] += 1
        for key, target in BEST_EFFORT_TARGETS:
            if distance < target:
                continue
            secs = rolling_best_effort(chart, target)
            if secs is None:
                continue
            current = best_efforts[key].get(date)
            if current is None or secs < current:
                best_efforts[key][date] = secs

        moving = parse_moving_time(summary.get("moving_time")) or seconds
        dec = decoupling_pct(chart, moving)
        if dec is not None:
            decoupling_monthly[mk].append(dec)

    # Progression: keep only dates where the running best improved.
    best_series: dict[str, list[dict[str, Any]]] = {}
    for key, _ in BEST_EFFORT_TARGETS:
        running_best: float | None = None
        series: list[dict[str, Any]] = []
        for date, secs in sorted(best_efforts[key].items()):
            if running_best is None or secs < running_best:
                running_best = float(secs)
                series.append({"date": date, "seconds": int(secs)})
        best_series[key] = series

    def summary_list(payload: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        for key in sorted(payload):
            v = payload[key]
            out.append(
                {
                    "key": key,
                    "distanceM": round(v["distanceM"], 1),
                    "seconds": round(v["seconds"], 1),
                    "runs": v["runs"],
                    "activeDays": len(v["days"]),
                    "weightedPaceSecPerKm": (
                        round(v["seconds"] / v["distanceM"] * 1000, 1)
                        if v["distanceM"] > 0 and v["seconds"] > 0
                        else None
                    ),
                }
            )
        return out

    eddington = 0
    for km in sorted(daily_km.values(), reverse=True):
        if km >= eddington + 1:
            eddington += 1
        else:
            break

    def medians(payload: dict[str, list[float]]) -> list[dict[str, Any]]:
        out = []
        for key in sorted(payload):
            value = median(payload[key])
            out.append(
                {"key": key, "median": round(value, 1) if value is not None else None}
            )
        return out

    return {
        "version": 1,
        "generatedFor": len(runs),
        "capabilities": dict(capability),
        "monthly": summary_list(monthly),
        "yearly": summary_list(yearly),
        "loadDays": [
            {"date": d, "load": round(load_days[d], 1)} for d in sorted(load_days)
        ],
        "vo2max": vo2_points,
        "cadenceMonthly": medians(cadence_monthly),
        "groundContactMonthly": medians(gct_monthly),
        "decouplingMonthly": medians(decoupling_monthly),
        "hrZonesMonthly": [
            {"key": k, "seconds": [round(s, 0) for s in v]}
            for k, v in sorted(hr_zone_monthly.items())
        ],
        "bestEfforts": best_series,
        "paceDistribution": [
            {"band": band, "count": count}
            for band, count in sorted(pace_distribution.items())
        ],
        "hourDistribution": hour_distribution,
        "eddington": eddington,
        "activeDays": len(active_days),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--activities", default=DEFAULT_ACTIVITIES)
    parser.add_argument("--splits", default=DEFAULT_SPLITS)
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    if not os.path.exists(args.activities):
        print(f"[summary] missing {args.activities}", file=sys.stderr)
        return 1

    activities = load_activities(args.activities)
    splits = load_splits(args.splits)
    payload = build(activities, splits)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    kb = round(os.path.getsize(args.out) / 1024)
    print(
        f"[summary] runs={payload['generatedFor']} splits={len(splits)} "
        f"-> {kb}KB  capabilities={json.dumps(payload['capabilities'], ensure_ascii=False)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
