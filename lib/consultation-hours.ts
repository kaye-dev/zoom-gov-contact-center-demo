export function isConsultationBusinessHours(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "24");
  return weekday !== "Sat" && weekday !== "Sun" && hour >= 9 && hour < 17;
}
