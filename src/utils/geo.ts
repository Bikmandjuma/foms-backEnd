import type { GeoMatchLevel } from "../generated/prisma/enums.js";

export interface GeoLocation {
  provinceId?: number | null;
  districtId?: number | null;
  sectorId?: number | null;
  cellId?: number | null;
  villageId?: number | null;
}

/**
 * Compares two locations from most-specific to least-specific — village →
 * cell → sector → district → province — and returns the tightest level at
 * which they agree. Mirrors the replacement-search order described in the
 * field-ops PRD: "An enumerator never picks their own replacement... the
 * replacement candidate must also satisfy geographic constraints."
 *
 * Returns null if nothing at all matches (not even province), which the
 * caller treats as requiring a recorded administrator override.
 */
export function computeMatchLevel(a: GeoLocation, b: GeoLocation): GeoMatchLevel | null {
  if (a.villageId != null && a.villageId === b.villageId) return "VILLAGE";
  if (a.cellId != null && a.cellId === b.cellId) return "CELL";
  if (a.sectorId != null && a.sectorId === b.sectorId) return "SECTOR";
  if (a.districtId != null && a.districtId === b.districtId) return "DISTRICT";
  if (a.provinceId != null && a.provinceId === b.provinceId) return "PROVINCE";
  return null;
}

const MATCH_RANK: Record<GeoMatchLevel, number> = {
  VILLAGE: 0,
  CELL: 1,
  SECTOR: 2,
  DISTRICT: 3,
  PROVINCE: 4,
  OVERRIDE: 5,
};

export function rankMatchLevel(level: GeoMatchLevel | null): number {
  return level === null ? 6 : MATCH_RANK[level];
}

/** Human-readable label for match-level badges in API responses. */
export function matchLevelLabel(level: GeoMatchLevel | null): string {
  if (level === null) return "No geographic overlap";
  const labels: Record<GeoMatchLevel, string> = {
    VILLAGE: "Same village",
    CELL: "Same cell",
    SECTOR: "Same sector",
    DISTRICT: "Same district",
    PROVINCE: "Same province",
    OVERRIDE: "Outside hierarchy (override)",
  };
  return labels[level];
}

/** In-place Fisher–Yates shuffle. Used so random assignment is genuinely
 * random and not just "insertion order", without ever needing to fabricate
 * distances or coordinates we don't have. */
export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Groups items by their full geographic path (province → district → sector
 * → cell → village), then shuffles *within* each group and shuffles the
 * group order itself. Flattening this back out gives a list where nearby
 * respondents tend to land next to each other in the assignment order —
 * "one vehicle shouldn't drive from Kigali to Nyagatare and then suddenly
 * go to Musanze" — while still being randomized, not manually picked.
 */
export function clusterByGeography<T extends GeoLocation>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = [item.provinceId, item.districtId, item.sectorId, item.cellId, item.villageId].join("|");
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const shuffledGroups = shuffle(Array.from(groups.values()));
  return shuffledGroups.flatMap((group) => shuffle(group));
}
