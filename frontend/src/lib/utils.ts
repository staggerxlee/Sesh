import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function duration(seconds: number, compact = false) {
  if (seconds > 0 && seconds < 60)
    return `${Math.max(1, Math.floor(seconds))}${compact ? "s" : " sec"}`;
  const m = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}${compact ? "m" : " min"}`;
}
export function timerDigits(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  return h > 0
    ? `${h.toString().padStart(2, "0")}:${Math.floor((s % 3600) / 60)
        .toString()
        .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`
    : `${Math.floor(s / 60)
        .toString()
        .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
export function dateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function dayLabel(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) {
  return new Date(value + "T12:00:00").toLocaleDateString("en-US", options);
}
