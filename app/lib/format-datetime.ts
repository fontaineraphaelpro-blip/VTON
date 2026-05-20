/** Stable date formatting for SSR + client (always UTC — avoids hydration mismatch). */

export function utcTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isUtcSameDay(dateInput: string, todayKey: string): boolean {
  const normalized = dateInput.includes("T") ? dateInput : `${dateInput}T12:00:00.000Z`;
  return normalized.slice(0, 10) === todayKey;
}

export function formatUtcChartLabel(dateInput: string): string {
  const normalized = dateInput.includes("T") ? dateInput : `${dateInput}T12:00:00.000Z`;
  return new Date(normalized).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatUtcDateTime(dateInput: string): string {
  return new Date(dateInput).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
