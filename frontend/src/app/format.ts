import type { DataProvenance, PriorityBand } from "../types";

export function formatTime(
  value: string | null | undefined,
  fallback = "Not connected",
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
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
