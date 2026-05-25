-- Forma — coaching tables (Step 05)
-- Goals and AI-generated weekly training plans.

CREATE TABLE goals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  race_name           TEXT        NOT NULL,
  race_date           DATE        NOT NULL,
  distance_meters     NUMERIC     NOT NULL,
  target_time_seconds INTEGER     NOT NULL,
  notes               TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT true
);

CREATE TABLE weekly_plans (
  week_start    DATE        PRIMARY KEY,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  goal_id       UUID        REFERENCES goals (id),
  plan          JSONB       NOT NULL,
  week_summary  TEXT
);

ALTER TABLE goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON goals        FOR SELECT USING (true);
CREATE POLICY "public read" ON weekly_plans FOR SELECT USING (true);
