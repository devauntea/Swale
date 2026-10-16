import type { DataProvenance, PriorityBand } from "../types";

// Locale and source-display timezone are fixed; reuse the formatter during playback.
const localTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatTime(
  value: string | null | undefined,
  fallback = "Not connected",
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  // A floating source time is not a known instant in the browser's time zone.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim()))
    return "Time zone unknown";
  return localTimeFormatter.format(date);
}
export function fixtureTime(provenance: DataProvenance): string {
  return formatTime(provenance.fixtureCreatedAt, "Fixed local example");
}
export function bandLabel(band: PriorityBand): string {
  return band === "unavailable"
    ? "Unavailable"
    : band[0].toUpperCase() + band.slice(1);
}
export function displayNumber(value: number | null, digits = 0): string {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits });
}
