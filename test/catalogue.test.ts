// ========================================================
// ECE Capstone Project Management System - Catalogue Unit Tests
// Verifies all catalogue entities, rubric maxima, and mappings
// ========================================================

import { describe, it, expect } from 'vitest';
import {
  PROGRAM_OUTCOMES,
  ATTRIBUTES,
  WK_PO_MAP,
  SDGS,
  RUBRICS,
} from '../prisma/catalogue-data';
import { Kind } from '@prisma/client';

describe('Catalogue Integrity: Washington Accord & PO Counts', () => {
  it('contains exactly 11 Program Outcomes (PO1 to PO11)', () => {
    expect(PROGRAM_OUTCOMES.length).toBe(11);
    const codes = PROGRAM_OUTCOMES.map((p) => p.code);
    for (let i = 1; i <= 11; i++) {
      expect(codes).toContain(`PO${i}`);
    }
  });

  it('contains exactly 9 Engineering Knowledge attributes (WK1 to WK9)', () => {
    const wks = ATTRIBUTES.filter((a) => a.kind === Kind.WK);
    expect(wks.length).toBe(9);
    const codes = wks.map((w) => w.code);
    for (let i = 1; i <= 9; i++) {
      expect(codes).toContain(`WK${i}`);
    }
  });

  it('contains exactly 7 Complex Problem Solving attributes (WP1 to WP7)', () => {
    const wps = ATTRIBUTES.filter((a) => a.kind === Kind.WP);
    expect(wps.length).toBe(7);
    const codes = wps.map((w) => w.code);
    for (let i = 1; i <= 7; i++) {
      expect(codes).toContain(`WP${i}`);
    }
  });

  it('contains exactly 5 Complex Engineering Activity attributes (EA1 to EA5)', () => {
    const eas = ATTRIBUTES.filter((a) => a.kind === Kind.EA);
    expect(eas.length).toBe(5);
    const codes = eas.map((e) => e.code);
    for (let i = 1; i <= 5; i++) {
      expect(codes).toContain(`EA${i}`);
    }
  });

  it('contains exactly 17 Sustainable Development Goals', () => {
    expect(SDGS.length).toBe(17);
    for (let i = 1; i <= 17; i++) {
      const sdg = SDGS.find((s) => s.id === i);
      expect(sdg).toBeDefined();
      expect(sdg?.targets.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('verifies WK-PO mapping contains expected relations', () => {
    const po1Wks = WK_PO_MAP.filter((m) => m.po === 'PO1').map((m) => m.wk);
    expect(po1Wks).toEqual(expect.arrayContaining(['WK1', 'WK2', 'WK3', 'WK4']));

    const po3Wks = WK_PO_MAP.filter((m) => m.po === 'PO3').map((m) => m.wk);
    expect(po3Wks).toContain('WK5');

    const po4Wks = WK_PO_MAP.filter((m) => m.po === 'PO4').map((m) => m.wk);
    expect(po4Wks).toContain('WK8');

    // PO8, PO9, PO10 have no linked WK in department catalogue
    expect(WK_PO_MAP.filter((m) => m.po === 'PO8').length).toBe(0);
    expect(WK_PO_MAP.filter((m) => m.po === 'PO9').length).toBe(0);
    expect(WK_PO_MAP.filter((m) => m.po === 'PO10').length).toBe(0);
  });
});

describe('Rubric Maxima & Spot-Check Verification (Brief Checks)', () => {
  const expectedMaxima: Record<string, number> = {
    A: 60,
    B: 40,
    C: 50,
    D: 50,
    E: 40,
    F: 60,
  };

  it('verifies that criteria sum for Rubrics A through F matches exact maxima (60, 40, 50, 50, 40, 60)', () => {
    for (const [code, max] of Object.entries(expectedMaxima)) {
      const rubric = RUBRICS.find((r) => r.code === code);
      expect(rubric).toBeDefined();
      expect(rubric?.maxMarks).toBe(max);

      const criteriaSum = rubric?.criteria.reduce((s, c) => s + c.maxMarks, 0);
      expect(criteriaSum).toBe(max);
    }
  });

  it('spot-checks 5 specific criteria against the specification', () => {
    // 1. Rubric A Literature survey = 30
    const rubricA = RUBRICS.find((r) => r.code === 'A');
    const litSurveyA = rubricA?.criteria.find((c) => c.key === 'lit_survey');
    expect(litSurveyA?.maxMarks).toBe(30);

    // 2. Rubric C Leadership and teamwork = 20
    const rubricC = RUBRICS.find((r) => r.code === 'C');
    const teamworkC = rubricC?.criteria.find((c) => c.key === 'teamwork');
    expect(teamworkC?.maxMarks).toBe(20);

    // 3. Rubric D Novelty / originality = 15
    const rubricD = RUBRICS.find((r) => r.code === 'D');
    const noveltyD = rubricD?.criteria.find((c) => c.key === 'novelty');
    expect(noveltyD?.maxMarks).toBe(15);

    // 4. Rubric D Realistic problem = 15
    const problemD = rubricD?.criteria.find((c) => c.key === 'realistic_problem');
    expect(problemD?.maxMarks).toBe(15);

    // 5. Rubric F Viva voce = 15
    const rubricF = RUBRICS.find((r) => r.code === 'F');
    const vivaF = rubricF?.criteria.find((c) => c.key === 'viva_voce');
    expect(vivaF?.maxMarks).toBe(15);
  });
});
