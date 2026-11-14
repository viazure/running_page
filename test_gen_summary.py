"""Synthetic checks for run_page/gen_summary.py (no activity corpus needed)."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "run_page"))

from gen_summary import build, is_device_hr_zone  # noqa: E402


def _activity(run_id: int, date: str = "2024-06-15 08:00:00") -> dict:
    return {
        "run_id": run_id,
        "type": "Run",
        "distance": 5000,
        "moving_time": "0:30:00",
        "start_date_local": date,
        "average_heartrate": 130,
    }


def _split(run_id: int, hr_zone: dict) -> dict:
    return {
        "run_id": run_id,
        "summary": {},
        "zones": {"hr": hr_zone},
        "splits": [],
        "chart": {},
    }


def test_is_device_hr_zone_skips_estimated():
    device = {
        "seconds": [10, 20, 30, 5],
        "high_boundary": [114, 141, 157, 167, 176, 189],
        "calc_type": "percent_lthr",
    }
    estimated = {
        "seconds": [40, 80, 60, 30, 20, 10],
        "high_boundary": [90, 108, 126, 144, 162, 180],
        "calc_type": "percent_max_hr_estimated",
    }
    assert is_device_hr_zone(device) is True
    assert is_device_hr_zone(estimated) is False
    assert is_device_hr_zone({"seconds": [1, 2], "calc_type": "time_in_zone"}) is False


def test_hr_zones_monthly_excludes_estimated():
    device = {
        "seconds": [10, 20, 30, 40],
        "high_boundary": [114, 141, 157, 167],
        "calc_type": "percent_lthr",
    }
    estimated = {
        "seconds": [100, 200, 50, 10],
        "high_boundary": [90, 108, 126, 144],
        "calc_type": "percent_max_hr_estimated",
    }
    payload = build(
        [_activity(1), _activity(2, "2024-06-16 08:00:00")],
        {
            1: _split(1, device),
            2: _split(2, estimated),
        },
    )
    assert payload["capabilities"]["hrZones"] == 1
    assert payload["hrZonesMonthly"] == [
        {"key": "2024-06", "seconds": [10, 20, 30, 40]}
    ]


def test_hr_zones_monthly_empty_when_only_estimated():
    estimated = {
        "seconds": [100, 200, 50, 10],
        "high_boundary": [90, 108, 126, 144],
        "calc_type": "percent_max_hr_estimated",
    }
    payload = build([_activity(1)], {1: _split(1, estimated)})
    assert "hrZones" not in payload["capabilities"]
    assert payload["hrZonesMonthly"] == []
