export type TimerMode = "stopwatch" | "countdown" | "pomodoro";
export interface PersonalCover {
  words: string;
  show_on_entry: boolean;
  image_revision: string | null;
  focal_x: number;
  focal_y: number;
}
export interface User {
  cover?: PersonalCover;
  id: number;
  email: string;
  first_name: string;
  email_verified: boolean;
}
export interface Preferences {
  timezone: string;
  week_start: number;
  daily_goal_minutes: number;
  weekly_goal_minutes: number;
  default_mode: TimerMode;
  default_duration: number;
  pomodoro_focus: number;
  short_break: number;
  long_break: number;
  theme: "light" | "dark" | "system";
  reduced_motion: boolean;
  notifications: boolean;
  rest_days?: number[];
}
export interface Subject {
  id: number;
  name: string;
  color: string;
  icon: string;
  weekly_goal_minutes: number;
  archived: boolean;
}
export interface Topic {
  id: number;
  subject: number;
  name: string;
}
export interface StudySession {
  id: number;
  subject: number;
  subject_name: string;
  subject_color: string;
  topic: number | null;
  topic_name: string | null;
  mode: TimerMode | "manual";
  status: "active" | "paused" | "completed" | "discarded";
  phase: "focus" | "break";
  started_at: string;
  ended_at: string | null;
  elapsed_seconds: number;
  phase_elapsed_seconds: number;
  source: "timer" | "manual";
  note: string;
  target_seconds: number;
  break_seconds: number;
  last_heartbeat_at: string;
  revision: number;
  recovery_required: boolean;
  restored?: boolean;
  server_now?: string;
  observed_at?: number;
  phase_started_at?: string;
}
export interface DayStat {
  date: string;
  seconds: number;
  goal_minutes: number;
  goal_achieved: boolean;
  is_rest_day: boolean;
  session_count: number;
  session_ids?: number[];
}
export interface SubjectStat {
  id: number;
  name: string;
  color: string;
  seconds: number;
  percent: number;
  weekly_seconds: number;
  monthly_seconds: number;
  weekly_goal_minutes: number;
  weekly_goal_percent?: number;
  daily: { date: string; seconds: number }[];
  weekly: { date: string; seconds: number }[];
  topics: { id: number; name: string; seconds: number }[];
}
export interface Analytics {
  today_seconds: number;
  yesterday_seconds: number;
  week_seconds: number;
  month_seconds: number;
  year_seconds: number;
  all_time_seconds: number;
  range_seconds: number;
  total_sessions: number;
  average_session_seconds: number;
  average_daily_seconds: number;
  longest_session_seconds: number;
  current_streak: number;
  longest_streak: number;
  active_days: number;
  month_active_days?: number;
  goal_achievement_rate: number;
  daily_goal_minutes: number;
  weekly_goal_minutes: number;
  week_goal_percent: number;
  today_goal_percent: number;
  previous_week_seconds: number;
  previous_month_seconds: number;
  week_change_percent: number | null;
  month_change_percent: number | null;
  most_productive_day: { date: string; seconds: number } | null;
  most_productive_weekday: {
    weekday: number;
    name: string;
    seconds: number;
  } | null;
  common_study_window: {
    label: string;
    start_hour: number;
    end_hour: number;
    seconds: number;
  } | null;
  daily: DayStat[];
  subjects: SubjectStat[];
  weekly: { date: string; seconds: number }[];
  recent_sessions: StudySession[];
}
export interface WeeklyReview {
  week_start: string;
  week_end: string;
  total_seconds: number;
  previous_seconds: number;
  change_percent: number | null;
  session_count: number;
  average_active_day_seconds: number;
  active_days: number;
  month_active_days?: number;
  daily_goals_achieved: number;
  weekly_goal_minutes: number;
  weekly_goal_percent: number;
  longest_session_seconds: number;
  subjects: SubjectStat[];
  daily: DayStat[];
  insights: string[];
}
