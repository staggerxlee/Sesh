/** One monotonic clock per mounted room. Hidden tabs catch up on return;
 * neither frame count nor study-timer state participates in this clock. */
export type AtmosphereMode = "cycle" | "local" | "hold";
export const DAY_SECONDS = 3600;
export const wrapDay = (seconds: number) =>
  ((seconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
export class RoomDay {
  private origin = performance.now();
  private frozen = 0;
  mode: AtmosphereMode = "cycle";
  private localSecond = -1;
  private localPhase = 0;
  private formatter: Intl.DateTimeFormat;
  constructor(timezone = "Asia/Kathmandu") {
    this.formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  read(now = performance.now(), date = new Date()) {
    if (this.mode === "hold") return this.frozen;
    if (this.mode === "local") {
      const second = Math.floor(date.getTime() / 1000);
      if (second === this.localSecond) return this.localPhase;
      this.localSecond = second;
      const parts = this.formatter.formatToParts(date);
      const n = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value || 0);
      // Dawn in the simulation corresponds to 06:00 in the configured timezone.
      this.localPhase = wrapDay(
        (n("hour") * 3600 + n("minute") * 60 + n("second") - 21600) / 24,
      );
      return this.localPhase;
    }
    return wrapDay((now - this.origin) / 1000);
  }
  setMode(mode: AtmosphereMode, now = performance.now(), date = new Date()) {
    const phase = this.read(now, date);
    this.frozen = phase;
    this.origin = now - phase * 1000;
    this.mode = mode;
  }
}
// Dawn → morning → afternoon → golden hour → dusk → night → dawn.
export const dayKeys = [
  { at: 0, color: "#d5adc8", sun: 0.65, ambient: 0.42, night: 0.5, lamp: 4.8 },
  { at: 600, color: "#d4e4ef", sun: 1.8, ambient: 0.82, night: 0, lamp: 2.4 },
  { at: 1200, color: "#f5e1c3", sun: 2.5, ambient: 0.9, night: 0, lamp: 1.7 },
  {
    at: 1800,
    color: "#ffc28a",
    sun: 2.1,
    ambient: 0.66,
    night: 0.08,
    lamp: 3.1,
  },
  {
    at: 2400,
    color: "#b497c6",
    sun: 0.65,
    ambient: 0.42,
    night: 0.62,
    lamp: 4.8,
  },
  { at: 2700, color: "#8399c8", sun: 0.16, ambient: 0.32, night: 1, lamp: 5.2 },
  { at: 3300, color: "#8399c8", sun: 0.16, ambient: 0.32, night: 1, lamp: 5.2 },
  {
    at: 3600,
    color: "#d5adc8",
    sun: 0.65,
    ambient: 0.42,
    night: 0.5,
    lamp: 4.8,
  },
] as const;
export function daySegment(seconds: number) {
  const phase = wrapDay(seconds);
  const index = Math.max(
    0,
    dayKeys.findIndex(
      (key, i) =>
        i < dayKeys.length - 1 && phase >= key.at && phase < dayKeys[i + 1].at,
    ),
  );
  const a = dayKeys[index],
    b = dayKeys[index + 1];
  const t = (phase - a.at) / (b.at - a.at);
  return { a, b, t: t * t * (3 - 2 * t), phase };
}
