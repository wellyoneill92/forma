-- Forma — initial schema
-- Derived from Garmin MCP data audit (2026-05-25).
--
-- Field notes from live data:
--   • Power fields omitted — never populated (no power meter)
--   • ATL/CTL omitted from training_load — garminconnect 0.3.3 returns null; training_status only
--   • body_composition table omitted — no Garmin scale connected
--   • avg_spo2, vo2_max_cycling retained as nullable — hardware-dependent
--   • stress time-in-zone (rest/low/medium/high minutes) omitted — returns null in practice
--   • readiness_factors stored as JSONB — variable-length array of {name, feedback}
--   • race_predictions stored as JSONB — [{distance, seconds}]


-- ─── Activities ───────────────────────────────────────────────────────────────
-- One row per Garmin activity. Synced by scripts/sync.py.

CREATE TABLE activities (
  id                        TEXT        PRIMARY KEY,  -- Garmin activityId (string)
  synced_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  name                      TEXT,
  activity_type             TEXT,                     -- 'running', 'walking', 'cycling', …
  start_time                TIMESTAMPTZ,
  duration_seconds          NUMERIC,
  distance_meters           NUMERIC,
  avg_heart_rate            INTEGER,
  max_heart_rate            INTEGER,
  calories                  INTEGER,
  elevation_gain_meters     NUMERIC,
  elevation_loss_meters     NUMERIC,
  avg_speed_mps             NUMERIC,
  max_speed_mps             NUMERIC,
  training_effect_aerobic   NUMERIC,
  training_effect_anaerobic NUMERIC
);

CREATE INDEX activities_start_time_idx ON activities (start_time DESC);
CREATE INDEX activities_type_idx       ON activities (activity_type);


-- ─── Activity Splits ──────────────────────────────────────────────────────────
-- Per-kilometre lap splits. Deleted when the parent activity is deleted.

CREATE TABLE activity_splits (
  id                    BIGSERIAL   PRIMARY KEY,
  activity_id           TEXT        NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  split_index           INTEGER     NOT NULL,
  distance_meters       NUMERIC,
  duration_seconds      NUMERIC,
  avg_heart_rate        INTEGER,
  avg_speed_mps         NUMERIC,
  elevation_gain_meters NUMERIC,
  UNIQUE (activity_id, split_index)
);


-- ─── Activity HR Zones ────────────────────────────────────────────────────────
-- Time spent in each heart-rate zone per activity.

CREATE TABLE activity_hr_zones (
  id                 BIGSERIAL PRIMARY KEY,
  activity_id        TEXT      NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  zone_number        INTEGER   NOT NULL,
  seconds_in_zone    NUMERIC,
  zone_low_boundary  INTEGER,
  UNIQUE (activity_id, zone_number)
);


-- ─── Daily Wellness ───────────────────────────────────────────────────────────
-- One row per calendar date. Merges sleep, HRV, readiness, training status,
-- RHR, body battery, stress, steps, and respiration into a single coaching row.
-- The coaching brain reads this table for daily context.

CREATE TABLE daily_wellness (
  date          DATE        PRIMARY KEY,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Sleep -----------------------------------------------------------------------
  sleep_score           INTEGER,   -- 0–100
  sleep_quality         TEXT,      -- 'GOOD', 'FAIR', 'POOR', etc.
  total_sleep_seconds   INTEGER,
  deep_sleep_seconds    INTEGER,
  light_sleep_seconds   INTEGER,
  rem_sleep_seconds     INTEGER,
  awake_seconds         INTEGER,
  avg_respiration       NUMERIC,   -- breaths/min during sleep
  avg_spo2              NUMERIC,   -- often null (hardware-dependent)

  -- HRV -------------------------------------------------------------------------
  hrv_status            TEXT,      -- 'BALANCED', 'LOW', 'HIGH', etc.
  hrv_last_night_avg_ms NUMERIC,
  hrv_weekly_avg_ms     NUMERIC,
  hrv_baseline_low_ms   NUMERIC,
  hrv_baseline_high_ms  NUMERIC,
  hrv_feedback          TEXT,      -- Garmin feedback key, e.g. 'HRV_BALANCED_2'

  -- Training readiness ----------------------------------------------------------
  readiness_score              INTEGER,  -- 0–100
  readiness_level              TEXT,     -- 'LOW', 'MODERATE', 'HIGH', 'PRIME'
  readiness_feedback_short     TEXT,
  readiness_feedback_long      TEXT,
  readiness_sleep_score        INTEGER,
  readiness_sleep_history      INTEGER,
  readiness_recovery_hours     INTEGER,
  readiness_acute_load         NUMERIC,
  readiness_hrv_status         TEXT,
  readiness_stress_history     INTEGER,
  readiness_factors            JSONB,    -- [{name, feedback}, …]

  -- Training load ---------------------------------------------------------------
  -- ATL/CTL null in garminconnect 0.3.3; only status string populates.
  training_status TEXT,  -- e.g. 'PRODUCTIVE_2', 'MAINTAINING_2', 'OVERREACHING_1'

  -- Resting heart rate ----------------------------------------------------------
  rhr_bpm INTEGER,

  -- Body battery ----------------------------------------------------------------
  body_battery_max     INTEGER,
  body_battery_min     INTEGER,
  body_battery_charged INTEGER,
  body_battery_drained INTEGER,

  -- Stress ----------------------------------------------------------------------
  avg_stress INTEGER,  -- 0–100
  max_stress INTEGER,

  -- Steps & calories ------------------------------------------------------------
  total_steps          INTEGER,
  step_goal            INTEGER,
  total_distance_meters NUMERIC,
  total_calories       INTEGER,
  active_calories      INTEGER,

  -- Respiration -----------------------------------------------------------------
  avg_breaths_per_min     NUMERIC,
  lowest_breaths_per_min  NUMERIC,
  highest_breaths_per_min NUMERIC
);


-- ─── Fitness Snapshots ────────────────────────────────────────────────────────
-- VO2 max and race predictions. Updated infrequently (after qualifying runs).

CREATE TABLE fitness_snapshots (
  id              BIGSERIAL   PRIMARY KEY,
  date            DATE        NOT NULL UNIQUE,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  vo2_max_running NUMERIC,          -- ml/kg/min
  vo2_max_cycling NUMERIC,          -- null — no power meter
  fitness_age     NUMERIC,
  race_predictions JSONB             -- [{distance: '5k', seconds: 1344}, …]
);

CREATE INDEX fitness_snapshots_date_idx ON fitness_snapshots (date DESC);


-- ─── Personal Records ─────────────────────────────────────────────────────────
-- One row per record type. Upserted on each sync.

CREATE TABLE personal_records (
  record_type  TEXT        PRIMARY KEY,  -- 'longest_run', 'fastest_5k', etc.
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  unit         TEXT,                     -- 'seconds', 'meters', 'count', 'days'
  raw_value    NUMERIC,
  value_seconds NUMERIC,
  value_meters  NUMERIC,
  activity_type TEXT,
  record_date   TIMESTAMPTZ,
  activity_id   TEXT
);


-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- The Vercel app reads via the anon key — grant SELECT.
-- The sync script writes via the service role key — no policy needed (bypasses RLS).

ALTER TABLE activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_splits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_hr_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_wellness    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON activities        FOR SELECT USING (true);
CREATE POLICY "public read" ON activity_splits   FOR SELECT USING (true);
CREATE POLICY "public read" ON activity_hr_zones FOR SELECT USING (true);
CREATE POLICY "public read" ON daily_wellness    FOR SELECT USING (true);
CREATE POLICY "public read" ON fitness_snapshots FOR SELECT USING (true);
CREATE POLICY "public read" ON personal_records  FOR SELECT USING (true);
