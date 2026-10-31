// ========================================================
// ECE Capstone Project Management System - Pure Calculation Engine
// Washington Accord (WP, WK, EA), SDG Mapping, PO Potential, Attainment
// ========================================================

export type Levels = Record<string, number>; // 'WP1'..'WP7', 'WK1'..'WK9', 'EA1'..'EA5' -> 0..3

export interface QualificationConfig {
  minLevel: number;    // default: 2
  minWpOfSix: number;  // default: 3 of WP2..WP7
  minEa: number;       // default: 2 of EA1..EA5
}

export const DEFAULT_CFG: QualificationConfig = {
  minLevel: 2,
  minWpOfSix: 3,
  minEa: 2,
};

/**
 * Step 1: Qualification Rule
 * WP1 at least 2; at least three of WP2 to WP7 at least 2;
 * at least two of EA1 to EA5 at least 2; at least one SDG with a target named.
 */
export function qualifies(
  levels: Levels,
  hasSdgTarget: boolean,
  cfg: QualificationConfig = DEFAULT_CFG
): boolean {
  const wp = ['WP2', 'WP3', 'WP4', 'WP5', 'WP6', 'WP7'].filter(
    (k) => (levels[k] ?? 0) >= cfg.minLevel
  ).length;

  const ea = ['EA1', 'EA2', 'EA3', 'EA4', 'EA5'].filter(
    (k) => (levels[k] ?? 0) >= cfg.minLevel
  ).length;

  return (
    (levels.WP1 ?? 0) >= cfg.minLevel &&
    wp >= cfg.minWpOfSix &&
    ea >= cfg.minEa &&
    hasSdgTarget
  );
}

/**
 * PO Potential Calculation:
 * Each PO that has WK codes in the department's mapping gets the mean of its linked WK levels.
 * POs with no WK link (PO8, PO9, PO10) return null (assessed by rubric).
 */
export function poPotential(
  wkLevels: Levels,
  wkPo: Record<string, string[]>
): Record<string, number | null> {
  return Object.fromEntries(
    Object.entries(wkPo).map(([po, wks]) => [
      po,
      wks.length
        ? Number((wks.reduce((s, k) => s + (wkLevels[k] ?? 0), 0) / wks.length).toFixed(2))
        : null,
    ])
  );
}

export function poPotentialCategory(score: number | null): 'Low' | 'Medium' | 'High' | 'Assessed by Rubric' {
  if (score === null) return 'Assessed by Rubric';
  if (score >= 2.0) return 'High';
  if (score >= 1.0) return 'Medium';
  return 'Low';
}

/**
 * Capstone Outlook (Screening label at topic stage):
 * - "Not yet qualifying" if the rule fails
 * - "Qualifies" if it passes
 * - "Strong" if passes with WP1 at 3, four or more of WP2 to WP7 at 2+, and three or more EA at 2+
 */
export function capstoneOutlook(
  levels: Levels,
  hasSdgTarget: boolean
): 'Not yet qualifying' | 'Qualifies' | 'Strong' {
  if (!qualifies(levels, hasSdgTarget)) {
    return 'Not yet qualifying';
  }

  const wp = ['WP2', 'WP3', 'WP4', 'WP5', 'WP6', 'WP7'].filter(
    (k) => (levels[k] ?? 0) >= 2
  ).length;

  const ea = ['EA1', 'EA2', 'EA3', 'EA4', 'EA5'].filter(
    (k) => (levels[k] ?? 0) >= 2
  ).length;

  if ((levels.WP1 ?? 0) >= 3 && wp >= 4 && ea >= 3) {
    return 'Strong';
  }

  return 'Qualifies';
}

export interface MarkEntryInput {
  marks: number;
  max: number;
  maps: string[]; // ['WP1', 'WK8', 'PO2', etc.]
}

/**
 * Attainment Formula:
 * Attainment(X) = sum(m_c) / sum(M_c) over criteria c mapped to X
 */
export function attainment(
  entries: MarkEntryInput[],
  metric: string
): number | null {
  const e = entries.filter((x) => x.maps.includes(metric));
  const M = e.reduce((s, x) => s + x.max, 0);
  if (M === 0) return null;
  return Number((e.reduce((s, x) => s + x.marks, 0) / M).toFixed(4));
}

/**
 * Department default attainment target threshold (65% per committee decision)
 */
export const DEFAULT_ATTAINMENT_TARGET = 0.65;

/**
 * Determines whether a calculated attainment ratio achieves the departmental target (>= 65%)
 */
export function isMetricAttained(
  attainmentRatio: number | null,
  target: number = DEFAULT_ATTAINMENT_TARGET
): boolean {
  if (attainmentRatio === null) return false;
  return attainmentRatio >= target;
}

/**
 * Default HITK Department WK-to-PO map seeded from catalogue
 */
export const DEFAULT_WK_PO_MAP: Record<string, string[]> = {
  PO1: ['WK1', 'WK2', 'WK3', 'WK4'],
  PO2: ['WK1', 'WK2', 'WK3', 'WK4'],
  PO3: ['WK5'],
  PO4: ['WK8'],
  PO5: ['WK2', 'WK6'],
  PO6: ['WK1', 'WK5', 'WK7'],
  PO7: ['WK9'],
  PO8: [], // Teamwork - assessed by rubric
  PO9: [], // Communication - assessed by rubric
  PO10: [], // Project Management & Finance - assessed by rubric
  PO11: ['WK8'],
};

/**
 * Derives the list of Program Outcomes (PO1..PO11) supported by a topic's
 * Washington Accord attributes (WK1..WK9, WP1..WP7, EA1..EA5).
 */
export function deriveMappedPoCodes(
  attributes: Array<{ level: number; attribute: { code: string; kind?: string } }> = [],
  wkPoMap: Record<string, string[]> = DEFAULT_WK_PO_MAP
): string[] {
  const activeWkCodes = new Set(
    attributes
      .filter((a) => a.level >= 1 && a.attribute.code.startsWith('WK'))
      .map((a) => a.attribute.code)
  );

  const poSet = new Set<string>();
  for (const [po, wks] of Object.entries(wkPoMap)) {
    if (wks.some((wk) => activeWkCodes.has(wk))) {
      poSet.add(po);
    }
  }

  // If topic has WP/EA attributes or no WK yet, include baseline engineering design POs
  const hasWpOrEa = attributes.some((a) => a.level >= 1);
  if (poSet.size === 0 && hasWpOrEa) {
    poSet.add('PO1');
    poSet.add('PO2');
    poSet.add('PO3');
  }

  return Array.from(poSet).sort(
    (a, b) => parseInt(a.replace('PO', ''), 10) - parseInt(b.replace('PO', ''), 10)
  );
}
