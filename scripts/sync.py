#!/usr/bin/env python3
"""
Forma — Garmin → Supabase sync script.

Pulls recent data from Garmin Connect via garmin_mcp and upserts it into
Supabase. Designed to run daily via cron or manually.

Usage:
    python3 scripts/sync.py              # sync last 7 days
    python3 scripts/sync.py --days 30    # sync last 30 days
    python3 scripts/sync.py --full       # sync last 90 days (initial load)

Requirements:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GARMIN_EMAIL, GARMIN_PASSWORD
    must be set in .env.local (loaded automatically).
"""

import subprocess
import sys

# Re-exec into garmin-mcp's uv-managed Python env when running locally.
_GARMIN_PYTHON = "/Users/georgiascott/.cache/uv/archive-v0/p3FKS2Ok7AwltqyL/bin/python3.12"
if sys.executable != _GARMIN_PYTHON and __import__("os").path.exists(_GARMIN_PYTHON):
    import os
    os.execv(_GARMIN_PYTHON, [_GARMIN_PYTHON] + sys.argv)

import argparse
import asyncio
import json
import os
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local from the project root.
_ROOT = Path(__file__).parent.parent
load_dotenv(_ROOT / ".env.local")

import httpx

from garmin_mcp.garmin_client import GarminClient
from garmin_mcp.paths import default_token_dir
from garmin_mcp.server import (
    _build_hrv_status,
    _build_training_load_summary,
    _parse_activity_detail,
    _parse_activity_list,
    _parse_body_battery,
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
)

# ─── Supabase client (minimal — just REST upserts) ───────────────────────────

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # upsert
}


async def upsert(
    table: str, rows: list[dict], client: httpx.AsyncClient, on_conflict: str | None = None
) -> None:
    if not rows:
        return
    # PostgREST requires every row to have identical keys.
    all_keys = {k for row in rows for k in row}
    rows = [{k: row.get(k) for k in all_keys} for row in rows]
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    resp = await client.post(
        url,
        headers=_HEADERS,
        content=json.dumps(rows, default=str),
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Supabase upsert to {table} failed {resp.status_code}: {resp.text[:300]}")
    print(f"  ✓ {table}: {len(rows)} row(s)")


# ─── Sync helpers ─────────────────────────────────────────────────────────────


async def sync_activities(garmin: GarminClient, http: httpx.AsyncClient, limit: int) -> None:
    print("Activities...")
    raw = await garmin.call("get_activities", 0, limit)
    activity_list = _parse_activity_list(raw)

    activity_rows = []
    split_rows = []
    zone_rows = []

    def _int(v):
        return int(v) if v is not None else None

    for act in activity_list.activities:
        activity_rows.append({
            "id": act.activity_id,
            "name": act.name,
            "activity_type": act.activity_type,
            "start_time": act.start_time,
            "duration_seconds": act.duration_seconds,
            "distance_meters": act.distance_meters,
            "avg_heart_rate": _int(act.avg_heart_rate),
            "max_heart_rate": _int(act.max_heart_rate),
            "calories": _int(act.calories),
        })

        try:
            summary = await garmin.call("get_activity", act.activity_id)
            try:
                splits_raw = await garmin.call("get_activity_splits", act.activity_id)
            except Exception:
                splits_raw = None
            try:
                zones_raw = await garmin.call("get_activity_hr_in_timezones", act.activity_id)
            except Exception:
                zones_raw = None

            detail = _parse_activity_detail(act.activity_id, summary, splits_raw, zones_raw)

            # Patch in detail-only fields.
            activity_rows[-1].update({
                "avg_heart_rate": _int(detail.avg_heart_rate),
                "max_heart_rate": _int(detail.max_heart_rate),
                "calories": _int(detail.calories),
                "elevation_gain_meters": detail.elevation_gain_meters,
                "elevation_loss_meters": detail.elevation_loss_meters,
                "avg_speed_mps": detail.avg_speed_mps,
                "max_speed_mps": detail.max_speed_mps,
                "training_effect_aerobic": detail.training_effect_aerobic,
                "training_effect_anaerobic": detail.training_effect_anaerobic,
            })

            for sp in detail.splits:
                split_rows.append({
                    "activity_id": act.activity_id,
                    "split_index": sp.split_index,
                    "distance_meters": sp.distance_meters,
                    "duration_seconds": sp.duration_seconds,
                    "avg_heart_rate": _int(sp.avg_heart_rate),
                    "avg_speed_mps": sp.avg_speed_mps,
                    "elevation_gain_meters": sp.elevation_gain_meters,
                })

            for z in detail.hr_zones:
                zone_rows.append({
                    "activity_id": act.activity_id,
                    "zone_number": z.zone_number,
                    "seconds_in_zone": z.seconds_in_zone,
                    "zone_low_boundary": z.zone_low_boundary,
                })

        except Exception as e:
            print(f"    ⚠ detail fetch failed for {act.activity_id}: {e}")

    await upsert("activities", activity_rows, http)
    await upsert("activity_splits", split_rows, http, on_conflict="activity_id,split_index")
    await upsert("activity_hr_zones", zone_rows, http, on_conflict="activity_id,zone_number")


async def sync_daily_wellness(
    garmin: GarminClient, http: httpx.AsyncClient, dates: list[str]
) -> None:
    print("Daily wellness...")
    rows = []

    for d in dates:
        row: dict = {"date": d}

        # Sleep
        try:
            raw = await garmin.call("get_sleep_data", d)
            s = _parse_sleep(raw, d)
            if s.total_sleep_seconds:
                row.update({
                    "sleep_score": s.sleep_score,
                    "sleep_quality": s.sleep_quality,
                    "total_sleep_seconds": s.total_sleep_seconds,
                    "deep_sleep_seconds": s.deep_sleep_seconds,
                    "light_sleep_seconds": s.light_sleep_seconds,
                    "rem_sleep_seconds": s.rem_sleep_seconds,
                    "awake_seconds": s.awake_seconds,
                    "avg_respiration": s.avg_respiration,
                    "avg_spo2": s.avg_spo2,
                })
        except Exception as e:
            print(f"    ⚠ sleep {d}: {e}")

        # HRV
        try:
            raw = await garmin.call("get_hrv_data", d)
            reading = _parse_hrv_day(d, raw)
            status = _build_hrv_status(raw if raw else None, [reading])
            row.update({
                "hrv_status": status.status,
                "hrv_last_night_avg_ms": status.last_night_avg_ms,
                "hrv_weekly_avg_ms": status.weekly_avg_ms,
                "hrv_baseline_low_ms": status.baseline_low_ms,
                "hrv_baseline_high_ms": status.baseline_high_ms,
                "hrv_feedback": status.feedback,
            })
        except Exception as e:
            print(f"    ⚠ hrv {d}: {e}")

        # Training readiness
        try:
            raw = await garmin.call("get_training_readiness", d)
            r = _parse_training_readiness(raw, d)
            if r.score is not None:
                row.update({
                    "readiness_score": r.score,
                    "readiness_level": r.level,
                    "readiness_feedback_short": r.feedback_short,
                    "readiness_feedback_long": r.feedback_long,
                    "readiness_sleep_score": r.sleep_score,
                    "readiness_sleep_history": r.sleep_history_score,
                    "readiness_recovery_hours": r.recovery_time_hours,
                    "readiness_acute_load": r.acute_load,
                    "readiness_hrv_status": r.hrv_status,
                    "readiness_stress_history": r.stress_history,
                    "readiness_factors": [f.model_dump(exclude_none=True) for f in r.factors],
                })
        except Exception as e:
            print(f"    ⚠ readiness {d}: {e}")

        # Training status
        try:
            raw = await garmin.call("get_training_status", d)
            tl = _parse_training_load_day(d, raw)
            if tl.training_status:
                row["training_status"] = tl.training_status
        except Exception as e:
            print(f"    ⚠ training status {d}: {e}")

        # RHR
        try:
            raw = await garmin.call("get_rhr_day", d)
            rhr = _parse_rhr_day(d, raw)
            if rhr.rhr_bpm:
                row["rhr_bpm"] = rhr.rhr_bpm
        except Exception as e:
            print(f"    ⚠ rhr {d}: {e}")

        # Body battery
        try:
            raw = await garmin.call("get_body_battery", d, d)
            bb = _parse_body_battery(raw, d)
            if bb.max_value is not None:
                row.update({
                    "body_battery_max": bb.max_value,
                    "body_battery_min": bb.min_value,
                    "body_battery_charged": bb.charged,
                    "body_battery_drained": bb.drained,
                })
        except Exception as e:
            print(f"    ⚠ body battery {d}: {e}")

        # Stress
        try:
            raw = await garmin.call("get_stress_data", d)
            st = _parse_stress(raw, d)
            if st.avg_stress is not None:
                row.update({
                    "avg_stress": st.avg_stress,
                    "max_stress": st.max_stress,
                })
        except Exception as e:
            print(f"    ⚠ stress {d}: {e}")

        # Steps & calories
        try:
            raw = await garmin.call("get_user_summary", d)
            sc = _parse_steps_and_calories(raw, d)
            if sc.total_steps is not None:
                row.update({
                    "total_steps": sc.total_steps,
                    "step_goal": sc.step_goal,
                    "total_distance_meters": sc.total_distance_meters,
                    "total_calories": sc.total_calories,
                    "active_calories": sc.active_calories,
                })
        except Exception as e:
            print(f"    ⚠ steps {d}: {e}")

        # Respiration
        try:
            raw = await garmin.call("get_respiration_data", d)
            resp = _parse_respiration(raw, d)
            if resp.avg_breaths_per_min is not None:
                row.update({
                    "avg_breaths_per_min": resp.avg_breaths_per_min,
                    "lowest_breaths_per_min": resp.lowest_breaths_per_min,
                    "highest_breaths_per_min": resp.highest_breaths_per_min,
                })
        except Exception as e:
            print(f"    ⚠ respiration {d}: {e}")

        rows.append(row)

    await upsert("daily_wellness", rows, http)


async def sync_fitness(garmin: GarminClient, http: httpx.AsyncClient) -> None:
    print("Fitness metrics...")
    today = date.today().isoformat()
    max_metrics = None
    used_date = today
    for offset in (0, 1, 3, 7):
        d = (date.today() - timedelta(days=offset)).isoformat()
        try:
            payload = await garmin.call("get_max_metrics", d)
            if payload:
                max_metrics = payload
                used_date = d
                break
        except Exception:
            continue

    try:
        race = await garmin.call("get_race_predictions")
    except Exception:
        race = None

    fm = _parse_fitness_metrics(used_date, max_metrics, race)
    if fm.vo2_max_running is not None or fm.race_predictions:
        await upsert("fitness_snapshots", [{
            "date": fm.date,
            "vo2_max_running": fm.vo2_max_running,
            "vo2_max_cycling": fm.vo2_max_cycling,
            "fitness_age": fm.fitness_age,
            "race_predictions": [p.model_dump() for p in fm.race_predictions],
        }], http, on_conflict="date")


async def sync_personal_records(garmin: GarminClient, http: httpx.AsyncClient) -> None:
    print("Personal records...")
    try:
        raw = await garmin.call("get_personal_record")
        prs = _parse_personal_records(raw)
        rows = [
            {
                "record_type": pr.record_type,
                "unit": pr.unit,
                "raw_value": pr.raw_value,
                "value_seconds": pr.value_seconds,
                "value_meters": pr.value_meters,
                "activity_type": pr.activity_type,
                "record_date": pr.record_date,
                "activity_id": pr.activity_id,
            }
            for pr in prs.records
        ]
        await upsert("personal_records", rows, http)
    except Exception as e:
        print(f"  ⚠ personal records: {e}")


# ─── Entry point ──────────────────────────────────────────────────────────────


async def main(days: int) -> None:
    email = os.environ.get("GARMIN_EMAIL", "")
    password = os.environ.get("GARMIN_PASSWORD", "")
    if not email or not password:
        sys.exit("GARMIN_EMAIL and GARMIN_PASSWORD must be set")
    token_dir = default_token_dir()

    garmin = GarminClient(email=email, password=password, token_dir=token_dir)

    # Dates to sync for daily wellness (oldest first).
    today = date.today()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(days)]
    dates.reverse()

    # Activity limit: roughly 2 activities/day.
    activity_limit = min(days * 2, 50)

    print(f"Forma sync — {today} — last {days} days")
    print("-" * 50)

    async with httpx.AsyncClient(timeout=90) as http:
        for attempt in range(3):
            try:
                await sync_activities(garmin, http, activity_limit)
                await sync_daily_wellness(garmin, http, dates)
                await sync_fitness(garmin, http)
                await sync_personal_records(garmin, http)
                break
            except Exception as e:
                if attempt < 2:
                    print(f"  ⚠ Attempt {attempt + 1} failed: {e} — retrying in 15s")
                    await asyncio.sleep(15)
                else:
                    raise

    print("-" * 50)
    print("Sync complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync Garmin data to Supabase.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--days", type=int, default=7, help="Number of days to sync (default: 7).")
    group.add_argument("--full", action="store_true", help="Full sync — last 90 days.")
    args = parser.parse_args()

    days = 90 if args.full else args.days
    asyncio.run(main(days))
