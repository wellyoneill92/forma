#!/usr/bin/env python3
"""
Garmin MCP data audit — queries all tools and prints live data.
Run: python3 scripts/garmin_audit.py
"""

import subprocess
import sys

# garmin-mcp ships its own Python 3.12 env; re-exec into it if needed.
_GARMIN_PYTHON = "/Users/georgiascott/.cache/uv/archive-v0/p3FKS2Ok7AwltqyL/bin/python3.12"
if sys.executable != _GARMIN_PYTHON:
    import os
    os.execv(_GARMIN_PYTHON, [_GARMIN_PYTHON] + sys.argv)

import asyncio
import getpass
import json
from datetime import date, timedelta
from pathlib import Path

from garmin_mcp.garmin_client import GarminClient
from garmin_mcp.paths import default_token_dir
from garmin_mcp.server import (
    _parse_activity_detail,
    _parse_activity_list,
    _parse_body_battery,
    _parse_body_composition,
    _parse_fitness_metrics,
    _parse_hrv_day,
    _parse_personal_records,
    _parse_respiration,
    _parse_rhr_day,
    _parse_sleep,
    _parse_steps_and_calories,
    _parse_stress,
    _parse_training_load_day,
    _parse_training_readiness,
    _build_hrv_status,
    _build_training_load_summary,
)

TODAY = date.today().isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()

SEP = "-" * 60


def section(title: str) -> None:
    print(f"\n{SEP}\n{title}\n{SEP}")


def dump(obj) -> None:
    print(json.dumps(obj.model_dump(exclude_none=True), indent=2, default=str))


async def run(client: GarminClient) -> None:
    # ── Sleep ──────────────────────────────────────────────────────────────
    section("SLEEP (last night)")
    try:
        raw = await client.call("get_sleep_data", YESTERDAY)
        dump(_parse_sleep(raw, YESTERDAY))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── HRV ───────────────────────────────────────────────────────────────
    section("HRV STATUS (last 7 nights)")
    try:
        readings = []
        headline = None
        for i in range(7):
            d = (date.today() - timedelta(days=i)).isoformat()
            try:
                raw = await client.call("get_hrv_data", d)
                readings.append(_parse_hrv_day(d, raw))
                if headline is None and raw:
                    headline = raw
            except Exception:
                from garmin_mcp.models import HRVDayReading
                readings.append(HRVDayReading(date=d))
        readings.reverse()
        dump(_build_hrv_status(headline, readings))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Training Readiness ─────────────────────────────────────────────────
    section("TRAINING READINESS (today)")
    try:
        raw = await client.call("get_training_readiness", TODAY)
        dump(_parse_training_readiness(raw, TODAY))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Training Load ──────────────────────────────────────────────────────
    section("TRAINING LOAD (last 7 days)")
    try:
        days = []
        latest = None
        for i in range(7):
            d = (date.today() - timedelta(days=i)).isoformat()
            try:
                raw = await client.call("get_training_status", d)
                days.append(_parse_training_load_day(d, raw))
                if latest is None and raw:
                    latest = raw
            except Exception:
                from garmin_mcp.models import TrainingLoadDay
                days.append(TrainingLoadDay(date=d))
        days.reverse()
        dump(_build_training_load_summary(days, latest))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Resting Heart Rate ─────────────────────────────────────────────────
    section("RESTING HEART RATE (last 7 days)")
    try:
        from garmin_mcp.models import RHRDay, RestingHeartRateTrend
        rows = []
        for i in range(7):
            d = (date.today() - timedelta(days=i)).isoformat()
            try:
                raw = await client.call("get_rhr_day", d)
                rows.append(_parse_rhr_day(d, raw))
            except Exception:
                rows.append(RHRDay(date=d))
        rows.reverse()
        valid = [r.rhr_bpm for r in rows if r.rhr_bpm]
        dump(RestingHeartRateTrend(days=rows, avg_rhr_bpm=sum(valid) / len(valid) if valid else None))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Body Battery ───────────────────────────────────────────────────────
    section("BODY BATTERY (today)")
    try:
        raw = await client.call("get_body_battery", TODAY, TODAY)
        result = _parse_body_battery(raw, TODAY)
        # Suppress the intraday timeline for readability
        print(json.dumps(
            {k: v for k, v in result.model_dump(exclude_none=True).items() if k != "timeline"},
            indent=2, default=str
        ))
        print(f"  timeline: {len(result.timeline)} readings")
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Steps & Calories ───────────────────────────────────────────────────
    section("STEPS & CALORIES (today)")
    try:
        raw = await client.call("get_user_summary", TODAY)
        dump(_parse_steps_and_calories(raw, TODAY))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Stress ────────────────────────────────────────────────────────────
    section("STRESS (today)")
    try:
        raw = await client.call("get_stress_data", TODAY)
        result = _parse_stress(raw, TODAY)
        print(json.dumps(
            {k: v for k, v in result.model_dump(exclude_none=True).items() if k != "timeline"},
            indent=2, default=str
        ))
        print(f"  timeline: {len(result.timeline)} buckets")
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Respiration ────────────────────────────────────────────────────────
    section("RESPIRATION (today)")
    try:
        raw = await client.call("get_respiration_data", TODAY)
        dump(_parse_respiration(raw, TODAY))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Fitness Metrics ────────────────────────────────────────────────────
    section("FITNESS METRICS (VO2 max, race predictions)")
    try:
        max_metrics = None
        for offset in (0, 1, 3, 7):
            d = (date.today() - timedelta(days=offset)).isoformat()
            try:
                payload = await client.call("get_max_metrics", d)
                if payload:
                    max_metrics = payload
                    break
            except Exception:
                continue
        try:
            race = await client.call("get_race_predictions")
        except Exception:
            race = None
        dump(_parse_fitness_metrics(TODAY, max_metrics, race))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Personal Records ───────────────────────────────────────────────────
    section("PERSONAL RECORDS")
    try:
        raw = await client.call("get_personal_record")
        dump(_parse_personal_records(raw))
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Recent Activities ──────────────────────────────────────────────────
    section("RECENT ACTIVITIES (last 5)")
    try:
        raw = await client.call("get_activities", 0, 5)
        result = _parse_activity_list(raw)
        dump(result)
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Activity Detail (most recent) ──────────────────────────────────────
    section("ACTIVITY DETAIL (most recent)")
    try:
        activities_raw = await client.call("get_activities", 0, 1)
        acts = _parse_activity_list(activities_raw)
        if acts.activities:
            aid = acts.activities[0].activity_id
            summary = await client.call("get_activity", aid)
            try:
                splits = await client.call("get_activity_splits", aid)
            except Exception:
                splits = None
            try:
                zones = await client.call("get_activity_hr_in_timezones", aid)
            except Exception:
                zones = None
            dump(_parse_activity_detail(aid, summary, splits, zones))
        else:
            print("No activities found.")
    except Exception as e:
        print(f"ERROR: {e}")

    # ── Body Composition ───────────────────────────────────────────────────
    section("BODY COMPOSITION (last 30 days)")
    try:
        start = (date.today() - timedelta(days=29)).isoformat()
        raw = await client.call("get_body_composition", start, TODAY)
        dump(_parse_body_composition(raw))
    except Exception as e:
        print(f"ERROR: {e}")


async def main() -> None:
    print(f"Garmin MCP Data Audit — {TODAY}")
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")

    token_dir = default_token_dir()
    client = GarminClient(email=email, password=password, token_dir=token_dir)

    print("\nAuthenticating...")
    await run(client)
    print(f"\n{SEP}\nAudit complete.\n")


if __name__ == "__main__":
    asyncio.run(main())
