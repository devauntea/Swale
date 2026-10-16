/**
 * STATIC / MTA service identity, verified 2026-10-16 against the MTA developer
 * page's NY Open Data line-color dataset. These colors never imply service health.
 * https://www.mta.info/developers
 * https://data.ny.gov/resource/3uhz-sej2.json
 */
export const MTA_PALETTE_PROVENANCE = {
  type: "STATIC",
  source: "MTA / NY Open Data line colors (3uhz-sej2)",
  url: "https://data.ny.gov/resource/3uhz-sej2.json",
  verifiedOn: "2026-10-16",
  sourceUpdatedAt: null,
  demo: false,
} as const;

const GROUPS = [
  ["A", "C", "E"],
  ["B", "D", "F", "M"],
  ["G"],
  ["J", "Z"],
  ["L", "S"],
  ["N", "Q", "R", "W"],
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7"],
] as const;
const COLORS = [
  "#0062CF",
  "#EB6800",
  "#799534",
  "#8E5C33",
  "#7C858C",
  "#F6BC26",
  "#D82233",
  "#009952",
  "#9A38A1",
] as const;
export const MTA_SERVICE_COLORS: Readonly<Record<string, string>> =
  Object.fromEntries(
    GROUPS.flatMap((routes, index) =>
      routes.map((route) => [route, COLORS[index]]),
    ),
  );

// Explicit GTFS aliases: shuttles and express variants share their named service
// color; the supplied identifier remains visible, including unknown identifiers.
const ALIASES: Readonly<Record<string, string>> = {
  FS: "S",
  GS: "S",
  H: "S",
  "6X": "6",
  "7X": "7",
  FX: "F",
};
export function canonicalService(route: string): string | null {
  const normalized = route.trim().toUpperCase();
  return (
    ALIASES[normalized] ??
    (Object.hasOwn(MTA_SERVICE_COLORS, normalized) ? normalized : null)
  );
}
export function serviceColor(route: string): string | null {
  const canonical = canonicalService(route);
  return canonical ? MTA_SERVICE_COLORS[canonical] : null;
}
export function serviceTextColor(route: string): string {
  const canonical = canonicalService(route);
  return canonical &&
    [
      "B",
      "D",
      "F",
      "M",
      "G",
      "L",
      "S",
      "N",
      "Q",
      "R",
      "W",
      "4",
      "5",
      "6",
    ].includes(canonical)
    ? "#081525"
    : "#FFFFFF";
}
export function serviceRgba(
  route: string,
): [number, number, number, number] | null {
  const color = serviceColor(route);
  return color
    ? ([1, 3, 5]
        .map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16))
        .concat(255) as [number, number, number, number])
    : null;
}
export function uniqueServices(routes: readonly string[]): string[] {
  return [...new Set(routes.map((route) => route.trim()).filter(Boolean))];
}

/** Read only the source's explicit relationship, never infer from a station ID. */
export function primitiveService(sourceIds: readonly string[]): string | null {
  const associations = sourceIds.flatMap((id) => {
    const match = /^S2:route=([A-Za-z0-9]+)$/.exec(id);
    return match ? [match[1]] : [];
  });
  return associations.length === 1 ? associations[0] : null;
}
