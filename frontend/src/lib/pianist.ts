export type PianistState =
  | "Idle"
  | "Entering"
  | "Walking"
  | "Sitting"
  | "Playing"
  | "Paused"
  | "Standing"
  | "Exiting";
export function pianistState(
  progress: number,
  enabled: boolean,
  playing: boolean,
): PianistState {
  if (progress <= 0) return "Idle";
  if (!enabled) return progress > 0.69 ? "Standing" : "Exiting";
  if (progress < 0.1) return "Entering";
  if (progress < 0.69) return "Walking";
  if (progress < 1) return "Sitting";
  return playing ? "Playing" : "Paused";
}
