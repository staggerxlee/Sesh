import type { StudySession } from "./types";
/** Wall-clock anchors survive throttled setInterval callbacks. Intervals only repaint. */
export function timerSnapshot(
  session: StudySession,
  observedAt: number,
  now: number,
  uncertain = false,
) {
  const ticking =
    session.status === "active" && !session.recovery_required && !uncertain;
  const delta = ticking ? Math.max(0, (now - observedAt) / 1000) : 0;
  const target =
    session.phase === "break" ? session.break_seconds : session.target_seconds;
  const capped = session.phase === "break" || session.mode !== "stopwatch";
  const phase = capped
    ? Math.min(target, session.phase_elapsed_seconds + delta)
    : session.phase_elapsed_seconds + delta;
  const extra = Math.max(0, phase - session.phase_elapsed_seconds);
  const elapsed =
    session.elapsed_seconds + (session.phase === "focus" ? extra : 0);
  return {
    elapsed,
    phase,
    remaining: Math.max(0, target - phase),
    complete: capped && phase >= target,
    progress: capped && target > 0 ? Math.min(1, phase / target) : 0,
  };
}
export function heartbeatGap(lastHeartbeat: string, now = Date.now()) {
  return now - new Date(lastHeartbeat).getTime() > 90_000;
}

/** Ignore late responses after a transition, including a heartbeat after finish. */
export function isOlderSnapshot(
  current: StudySession | null,
  next: StudySession | null,
  ended: ReadonlySet<number>,
) {
  if (!next) return false;
  if (ended.has(next.id)) return true;
  if (!current || current.id !== next.id) return false;
  if (next.revision !== current.revision)
    return next.revision < current.revision;
  return !!(
    current.server_now &&
    next.server_now &&
    Date.parse(next.server_now) < Date.parse(current.server_now)
  );
}
