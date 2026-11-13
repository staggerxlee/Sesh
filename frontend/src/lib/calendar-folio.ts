import type { DayStat, StudySession } from "./types";
export type FocusInterval = {
  session_id: number;
  started_at: string;
  ended_at: string;
  seconds: number;
  offset_seconds: number;
  span_seconds: number;
};
export type DayWindow = {
  started_at: string;
  ended_at: string;
  seconds: number;
};
export type Accounting = {
  focus_seconds: number;
  break_seconds: number;
  paused_seconds: number | null;
  wall_seconds: number | null;
};
export function archiveClock(iso: string, zone: string, offset = false) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    ...(offset ? { timeZoneName: "shortOffset" as const } : {}),
  });
}
export function earnedGoal(
  previous: DayStat | undefined,
  next: DayStat,
  today: string,
) {
  return (
    next.date === today &&
    !!previous &&
    !previous.goal_achieved &&
    next.goal_achieved &&
    previous.goal_minutes === next.goal_minutes &&
    next.seconds > previous.seconds
  );
}
// Place actual focus, not the wall-clock span of a session. Separate lanes preserve overlaps.
export function timelineLanes(intervals: FocusInterval[]) {
  const ends: number[] = [];
  return intervals.map((interval) => {
    let lane = ends.findIndex((end) => end <= interval.offset_seconds);
    if (lane < 0) lane = ends.length;
    ends[lane] = interval.offset_seconds + interval.span_seconds;
    return { ...interval, lane };
  });
}
export function fullSessionStamp(iso: string, zone: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  });
}
export type FolioSession = {
  session: StudySession;
  allocated: number;
  accounting?: Accounting;
};
