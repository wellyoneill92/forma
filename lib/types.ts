export interface DailyWellness {
  date: string;
  sleep_score: number | null;
  sleep_quality: string | null;
  total_sleep_seconds: number | null;
  hrv_last_night_avg_ms: number | null;
  hrv_status: string | null;
  readiness_score: number | null;
  readiness_level: string | null;
  readiness_feedback_short: string | null;
  training_status: string | null;
  rhr_bpm: number | null;
  body_battery_max: number | null;
  body_battery_min: number | null;
  avg_stress: number | null;
  total_steps: number | null;
}

export interface Activity {
  id: string;
  name: string | null;
  activity_type: string | null;
  start_time: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  avg_heart_rate: number | null;
  training_effect_aerobic: number | null;
}

export interface Goal {
  id: string;
  race_name: string;
  race_date: string;
  distance_meters: number;
  target_time_seconds: number;
  notes: string | null;
  is_active: boolean;
}

export interface PlanDay {
  date: string;
  day_of_week: string;
  session_type: string;
  sessions: string[];
  description: string;
  target_distance_km: number | null;
  target_duration_minutes: number | null;
  intensity: string;
  hr_zone: number | null;
  notes: string;
}

export interface WeekPlan {
  week_start: string;
  total_planned_km: number;
  coach_notes: string;
  days: PlanDay[];
}

export interface WeeklyPlan {
  week_start: string;
  generated_at: string;
  goal_id: string | null;
  plan: WeekPlan;
  week_summary: string | null;
}
