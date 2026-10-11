// ========================================================
// ECE Capstone Project Management System - Vitest Test Suite
// Unit tests for lib/engine.ts and lib/engine/capstone.ts
// ========================================================

import { describe, it, expect } from 'vitest';
import {
  qualifies,
  poPotential,
  poPotentialCategory,
  capstoneOutlook,
  attainment,
  isMetricAttained,
  DEFAULT_ATTAINMENT_TARGET,
  DEFAULT_WK_PO_MAP,
  Levels,
} from '../lib/engine';
import { evaluateCapstone, RubricDScore, RubricFScore } from '../lib/engine/capstone';

describe('Engine: Qualification Rule (Step 1)', () => {
  it('fails if WP1 < 2', () => {
    const levels: Levels = {
      WP1: 1,
      WP2: 2,
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 2,
    };
    expect(qualifies(levels, true)).toBe(false);
  });

  it('fails if fewer than 3 of WP2..WP7 are >= 2', () => {
    const levels: Levels = {
      WP1: 2,
      WP2: 2,
      WP3: 2,
      WP4: 1,
      WP5: 1,
      WP6: 0,
      WP7: 0,
      EA1: 2,
      EA2: 2,
    };
    expect(qualifies(levels, true)).toBe(false);
  });

  it('fails if fewer than 2 of EA1..EA5 are >= 2', () => {
    const levels: Levels = {
      WP1: 2,
      WP2: 2,
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 1,
      EA3: 1,
      EA4: 0,
      EA5: 0,
    };
    expect(qualifies(levels, true)).toBe(false);
  });

  it('fails if hasSdgTarget is false', () => {
    const levels: Levels = {
      WP1: 2,
      WP2: 2,
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 2,
    };
    expect(qualifies(levels, false)).toBe(false);
  });

  it('passes when WP1 >= 2, at least 3 of WP2..WP7 >= 2, at least 2 of EA1..EA5 >= 2, and SDG target present', () => {
    const levels: Levels = {
      WP1: 2,
      WP2: 2,
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 2,
    };
    expect(qualifies(levels, true)).toBe(true);
  });

  it('flips from failing to passing when WP2 increases from 1 to 2', () => {
    const levels: Levels = {
      WP1: 2,
      WP2: 1, // failing here (only 2 of WP2..WP7 >= 2)
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 2,
    };
    expect(qualifies(levels, true)).toBe(false);

    levels.WP2 = 2; // flips to passing
    expect(qualifies(levels, true)).toBe(true);
  });
});

describe('Engine: PO Potential Calculation', () => {
  it('calculates average linked WK level and sets null for PO8-PO10', () => {
    const wkLevels: Levels = {
      WK1: 2,
      WK2: 2,
      WK3: 1,
      WK4: 3,
      WK5: 2,
      WK6: 1,
      WK7: 0,
      WK8: 3,
      WK9: 2,
    };

    const res = poPotential(wkLevels, DEFAULT_WK_PO_MAP);

    // PO1 linked to WK1, WK2, WK3, WK4 -> (2+2+1+3)/4 = 2.0
    expect(res.PO1).toBe(2.0);
    expect(poPotentialCategory(res.PO1)).toBe('High');

    // PO3 linked to WK5 (2) -> 2.0
    expect(res.PO3).toBe(2.0);

    // PO8, PO9, PO10 are assessed by rubric
    expect(res.PO8).toBeNull();
    expect(res.PO9).toBeNull();
    expect(res.PO10).toBeNull();
    expect(poPotentialCategory(res.PO8)).toBe('Assessed by Rubric');
  });
});

describe('Engine: Capstone Screening Outlook', () => {
  it('returns "Not yet qualifying" if qualification fails', () => {
    expect(capstoneOutlook({ WP1: 1 }, true)).toBe('Not yet qualifying');
  });

  it('returns "Qualifies" for basic qualifying project', () => {
    const levels: Levels = {
      WP1: 2,
      WP2: 2,
      WP3: 2,
      WP4: 2,
      EA1: 2,
      EA2: 2,
    };
    expect(capstoneOutlook(levels, true)).toBe('Qualifies');
  });

  it('returns "Strong" when WP1=3, 4+ of WP2..WP7 >= 2, and 3+ EA >= 2', () => {
    const levels: Levels = {
      WP1: 3,
      WP2: 2,
      WP3: 2,
      WP4: 2,
      WP5: 2,
      EA1: 2,
      EA2: 2,
      EA3: 2,
    };
    expect(capstoneOutlook(levels, true)).toBe('Strong');
  });
});

describe('Engine: Attainment Formula', () => {
  it('correctly calculates attainment ratio across criteria', () => {
    const entries = [
      { marks: 15, max: 20, maps: ['PO1', 'WP1'] },
      { marks: 18, max: 20, maps: ['PO1', 'WP3'] },
      { marks: 8, max: 10, maps: ['PO2'] },
    ];

    // PO1: total marks = 33, total max = 40 -> 33/40 = 0.825
    expect(attainment(entries, 'PO1')).toBe(0.825);
    // PO2: total marks = 8, total max = 10 -> 8/10 = 0.8
    expect(attainment(entries, 'PO2')).toBe(0.8);
    // Non-existent metric returns null
    expect(attainment(entries, 'PO99')).toBeNull();
  });

  it('evaluates attainment threshold against 65% default target', () => {
    expect(DEFAULT_ATTAINMENT_TARGET).toBe(0.65);
    expect(isMetricAttained(0.65)).toBe(true);
    expect(isMetricAttained(0.649)).toBe(false);
    expect(isMetricAttained(0.825)).toBe(true);
    expect(isMetricAttained(null)).toBe(false);
  });
});

describe('Engine: Capstone 4-Step Pipeline', () => {
  const qualifyingLevels: Levels = {
    WP1: 2,
    WP2: 2,
    WP3: 2,
    WP4: 2,
    EA1: 2,
    EA2: 2,
  };

  it('returns PENDING if marks are missing', () => {
    const res = evaluateCapstone({
      topicLevels: qualifyingLevels,
      hasSdgTarget: true,
      declarationsConfirmed: true,
    });

    expect(res.status).toBe('PENDING');
    expect(res.step1.passed).toBe(true);
    expect(res.step2.pending).toBe(true);
  });

  it('correctly averages Rubric D panel slots', () => {
    const panelSlots: RubricDScore[] = [
      { examinerSlot: 1, novelty: 6, realisticProblem: 6, impactOnSociety: 2 },
      { examinerSlot: 2, novelty: 4, realisticProblem: 6, impactOnSociety: 2 },
    ];
    // avg Novelty = 5.0 (>= 5 passes)
    const sem8Score: RubricFScore = {
      novelty: 6,
      realisticProblem: 6,
      impactOnSociety: 2,
    };

    const res = evaluateCapstone({
      topicLevels: qualifyingLevels,
      hasSdgTarget: true,
      rubricDScores: panelSlots,
      rubricFScore: sem8Score,
      declarationsConfirmed: true,
    });

    expect(res.step2.passed).toBe(true);
    expect(res.step3.passed).toBe(true);
    expect(res.isCapstone).toBe(true);
    expect(res.status).toBe('QUALIFIED');
  });

  it('fails boundary test if Rubric F novelty is 5.9 (below required 6 of 8)', () => {
    const sem8Score: RubricFScore = {
      novelty: 5.9,
      realisticProblem: 6,
      impactOnSociety: 2,
    };

    const res = evaluateCapstone({
      topicLevels: qualifyingLevels,
      hasSdgTarget: true,
      rubricDScores: [{ examinerSlot: 1, novelty: 5, realisticProblem: 5, impactOnSociety: 2 }],
      rubricFScore: sem8Score,
      declarationsConfirmed: true,
    });

    expect(res.step3.passed).toBe(false);
    expect(res.isCapstone).toBe(false);
    expect(res.status).toBe('FAILED');
  });
});
