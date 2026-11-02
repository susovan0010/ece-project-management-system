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
 * NBA Standard 3-tier Attainment Level Scale:
 * - Level 0: < 65% (Not Attained)
 * - Level 1: 65% to 75% [0.65, 0.75)
 * - Level 2: 75% to 85% [0.75, 0.85)
 * - Level 3: >= 85% [0.85, 1.0]
 * Accepts either ratio (0.0 .. 1.0) or percentage (0 .. 100).
 */
export function getAttainmentLevel(scoreOrRatio: number | null): number {
  if (scoreOrRatio === null || isNaN(scoreOrRatio)) return 0;
  const percentage = scoreOrRatio <= 1.0 && scoreOrRatio >= 0 ? scoreOrRatio * 100 : scoreOrRatio;
  if (percentage >= 85) return 3;
  if (percentage >= 75) return 2;
  if (percentage >= 65) return 1;
  return 0;
}

export function getAttainmentLevelDescription(level: number): string {
  switch (level) {
    case 3:
      return 'Level 3 (≥85% - High)';
    case 2:
      return 'Level 2 (75% to 85% - Moderate)';
    case 1:
      return 'Level 1 (65% to 75% - Threshold)';
    default:
      return 'Level 0 (<65% - Not Attained)';
  }
}

/**
 * Department student cohort threshold benchmark for NBA PO attainment:
 * 60% of students must achieve the level's benchmark score.
 */
export const DEFAULT_COHORT_STUDENT_TARGET_PCT = 60;

export interface CohortCumulativeDistribution {
  totalStudents: number;
  countGte85: number; // Level 3 mark (>= 85%)
  countGte75: number; // Level 2 mark (>= 75%, cumulative)
  countGte65: number; // Level 1 mark (>= 65%, cumulative)
  countLt65: number;  // Level 0 mark (< 65%)
  pctGte85: number;
  pctGte75: number;
  pctGte65: number;
  pctLt65: number;
  attainmentLevel: number; // 0, 1, 2, or 3
  isAttained: boolean;     // attainmentLevel >= 1
}

/**
 * Computes NBA Department PO Attainment Level based on the 60% Cumulative Student Cohort Rule:
 * - Level 3: >= 60% of students scored >= 85% marks
 * - Level 2: >= 60% of students scored >= 75% marks (cumulative: includes >= 85% and 75%-85%)
 * - Level 1: >= 60% of students scored >= 65% marks (cumulative: includes all >= 65%)
 * - Level 0: < 60% of students scored >= 65% marks (Not Attained)
 */
export function calculateCohortAttainmentLevel(
  studentPercentages: number[],
  cohortTargetPct: number = DEFAULT_COHORT_STUDENT_TARGET_PCT
): CohortCumulativeDistribution {
  const total = studentPercentages.length;
  if (total === 0) {
    return {
      totalStudents: 0,
      countGte85: 0,
      countGte75: 0,
      countGte65: 0,
      countLt65: 0,
      pctGte85: 0,
      pctGte75: 0,
      pctGte65: 0,
      pctLt65: 0,
      attainmentLevel: 0,
      isAttained: false,
    };
  }

  const countGte85 = studentPercentages.filter((p) => p >= 85).length;
  const countGte75 = studentPercentages.filter((p) => p >= 75).length;
  const countGte65 = studentPercentages.filter((p) => p >= 65).length;
  const countLt65 = studentPercentages.filter((p) => p < 65).length;

  const pctGte85 = Math.round((countGte85 / total) * 100);
  const pctGte75 = Math.round((countGte75 / total) * 100);
  const pctGte65 = Math.round((countGte65 / total) * 100);
  const pctLt65 = Math.round((countLt65 / total) * 100);

  let attainmentLevel = 0;
  if (pctGte85 >= cohortTargetPct) {
    attainmentLevel = 3;
  } else if (pctGte75 >= cohortTargetPct) {
    attainmentLevel = 2;
  } else if (pctGte65 >= cohortTargetPct) {
    attainmentLevel = 1;
  } else {
    attainmentLevel = 0;
  }

  return {
    totalStudents: total,
    countGte85,
    countGte75,
    countGte65,
    countLt65,
    pctGte85,
    pctGte75,
    pctGte65,
    pctLt65,
    attainmentLevel,
    isAttained: attainmentLevel >= 1,
  };
}

export interface StudentMarkEntryInput {
  studentId?: string | null;
  marks: number;
  max: number;
  maps: string[];
}

export interface MetricAttainmentResult {
  metric: string;
  ratio: number;
  percentage: number;
  level: number;
  isAttained: boolean;
}

/**
 * Computes individual student attainment across mapped criteria.
 * Inherits group-scope marks (studentId === null) and incorporates individual-scope marks.
 */
export function calculateStudentAttainment(
  entries: StudentMarkEntryInput[],
  studentId: string,
  metrics: string[]
): Record<string, MetricAttainmentResult> {
  const relevantEntries = entries.filter(
    (e) => !e.studentId || e.studentId === studentId
  );

  const results: Record<string, MetricAttainmentResult> = {};
  for (const metric of metrics) {
    const mapped = relevantEntries.filter((e) => e.maps.includes(metric));
    const maxTotal = mapped.reduce((s, e) => s + e.max, 0);
    if (maxTotal === 0) continue;
    const marksTotal = mapped.reduce((s, e) => s + e.marks, 0);
    const ratio = Number((marksTotal / maxTotal).toFixed(4));
    const percentage = Math.round(ratio * 100);
    const level = getAttainmentLevel(ratio);
    results[metric] = {
      metric,
      ratio,
      percentage,
      level,
      isAttained: level >= 1,
    };
  }
  return results;
}

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
