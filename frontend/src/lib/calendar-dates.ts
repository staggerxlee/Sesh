export function dayAdd(key: string, days: number) {
  const date = new Date(key + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekday(key: string) {
  return (new Date(key + "T12:00:00Z").getUTCDay() + 6) % 7;
}
export function weekStart(key: string, start: number) {
  return dayAdd(key, -((weekday(key) - start + 7) % 7));
}
export function monthStart(key: string) {
  return key.slice(0, 7) + "-01";
}
export function monthEnd(key: string) {
  const date = new Date(key + "T12:00:00Z");
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12),
  )
    .toISOString()
    .slice(0, 10);
}
export function monthAdd(key: string, n: number) {
  const date = new Date(key + "T12:00:00Z");
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1, 12),
  )
    .toISOString()
    .slice(0, 10);
}

export function calendarDates(start: string, end: string) {
  const dates: string[] = [];
  for (let day = start; day <= end; day = dayAdd(day, 1)) dates.push(day);
  return dates;
}
