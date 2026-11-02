export type TimeUnit = "hours" | "minutes" | "seconds";
export const MAX_FOCUS_SECONDS = 24 * 3600;
export const MAX_BREAK_SECONDS = 2 * 3600;
export const unitSeconds: Record<TimeUnit, number> = {
  hours: 3600,
  minutes: 60,
  seconds: 1,
};
export function clockParts(total: number) {
  const value = Math.max(0, Math.floor(total));
  return {
    hours: Math.floor(value / 3600),
    minutes: Math.floor(value / 60) % 60,
    seconds: value % 60,
  };
}
export function adjustTime(
  total: number,
  unit: TimeUnit,
  step: number,
  max: number,
) {
  return Math.max(0, Math.min(max, total + step * unitSeconds[unit]));
}
export function editTime(
  total: number,
  unit: TimeUnit,
  raw: string,
  max: number,
): { value?: number; error?: string } {
  if (!/^\d+$/.test(raw.trim()))
    return { error: "Enter a whole, non-negative number." };
  const number = Number(raw);
  if (
    (unit === "seconds" || (unit === "minutes" && total >= 3600)) &&
    number > 59
  )
    return { error: `Use 00–59 for ${unit}.` };
  const value = total + (number - clockParts(total)[unit]) * unitSeconds[unit];
  if (!Number.isSafeInteger(value) || value > max)
    return { error: `Maximum duration is ${max / 3600} hours.` };
  return { value };
}
