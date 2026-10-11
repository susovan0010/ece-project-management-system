// ========================================================
// ECE Capstone Project Management System - Capstone Evaluation Engine
// 4-Step Capstone Qualification Pipeline (Proposal Section 8.3)
// ========================================================

import { qualifies, Levels, QualificationConfig, DEFAULT_CFG } from '../engine';

export interface RubricDScore {
  examinerSlot: number; // 1..N
  novelty: number;       // max 7
  realisticProblem: number; // max 7
  impactOnSociety: number;  // max 3
}

export interface RubricFScore {
  novelty: number;          // max 8
  realisticProblem: number; // max 8
  impactOnSociety: number;  // max 3
}

export interface CapstoneInput {
  topicLevels: Levels;
  hasSdgTarget: boolean;
  qualConfig?: QualificationConfig;

  // Sem 7 Panel Scores (Rubric D) across examiner slots
  rubricDScores?: RubricDScore[];

  // Sem 8 External Examiner Score (Rubric F)
  rubricFScore?: RubricFScore;

  // Step 4: Supervisor Complexity Declarations
  declarationsConfirmed: boolean;
}

export interface StepEvaluation {
  passed: boolean;
  pending: boolean;
  details: string;
}

export interface CapstoneResult {
  step1: StepEvaluation;
  step2: StepEvaluation;
  step3: StepEvaluation;
  step4: StepEvaluation;
  isCapstone: boolean;
  status: 'QUALIFIED' | 'FAILED' | 'PENDING';
  summary: string;
}

export const CAPSTONE_THRESHOLDS = {
  sem7: {
    noveltyMin: 5,
    noveltyMax: 7,
    realisticMin: 5,
    realisticMax: 7,
    impactMin: 2,
    impactMax: 3,
  },
  sem8: {
    noveltyMin: 6,
    noveltyMax: 8,
    realisticMin: 6,
    realisticMax: 8,
    impactMin: 2,
    impactMax: 3,
  },
};

/**
 * Evaluates a project against the Departmental 4-Step Capstone Rule
 */
export function evaluateCapstone(input: CapstoneInput): CapstoneResult {
  // Step 1: Scorecard meets qualification rule
  const step1Passed = qualifies(input.topicLevels, input.hasSdgTarget, input.qualConfig ?? DEFAULT_CFG);
  const step1: StepEvaluation = {
    passed: step1Passed,
    pending: false,
    details: step1Passed
      ? 'Topic scorecard satisfies WP, EA, and SDG qualification rules.'
      : 'Topic scorecard does not meet required WP/EA/SDG threshold.',
  };

  // Step 2: 7th semester panel average (Rubric D)
  let step2: StepEvaluation;
  if (!input.rubricDScores || input.rubricDScores.length === 0) {
    step2 = { passed: false, pending: true, details: 'Semester 7 panel marks (Rubric D) not yet entered.' };
  } else {
    const slotCount = input.rubricDScores.length;
    const avgNovelty = input.rubricDScores.reduce((sum, s) => sum + s.novelty, 0) / slotCount;
    const avgRealistic = input.rubricDScores.reduce((sum, s) => sum + s.realisticProblem, 0) / slotCount;
    const avgImpact = input.rubricDScores.reduce((sum, s) => sum + s.impactOnSociety, 0) / slotCount;

    const passNovelty = avgNovelty >= CAPSTONE_THRESHOLDS.sem7.noveltyMin;
    const passRealistic = avgRealistic >= CAPSTONE_THRESHOLDS.sem7.realisticMin;
    const passImpact = avgImpact >= CAPSTONE_THRESHOLDS.sem7.impactMin;

    const passed = passNovelty && passRealistic && passImpact;
    step2 = {
      passed,
      pending: false,
      details: passed
        ? `Panel average meets cut-offs: Novelty ${avgNovelty.toFixed(1)}/7, Problem ${avgRealistic.toFixed(1)}/7, Impact ${avgImpact.toFixed(1)}/3.`
        : `Panel average below cut-offs (Req: Nov>=5, Real>=5, Imp>=2). Actual: Nov ${avgNovelty.toFixed(1)}, Real ${avgRealistic.toFixed(1)}, Imp ${avgImpact.toFixed(1)}.`,
    };
  }

  // Step 3: 8th semester external examiner (Rubric F)
  let step3: StepEvaluation;
  if (!input.rubricFScore) {
    step3 = { passed: false, pending: true, details: 'Semester 8 external examiner marks (Rubric F) not yet entered.' };
  } else {
    const passNovelty = input.rubricFScore.novelty >= CAPSTONE_THRESHOLDS.sem8.noveltyMin;
    const passRealistic = input.rubricFScore.realisticProblem >= CAPSTONE_THRESHOLDS.sem8.realisticMin;
    const passImpact = input.rubricFScore.impactOnSociety >= CAPSTONE_THRESHOLDS.sem8.impactMin;

    const passed = passNovelty && passRealistic && passImpact;
    step3 = {
      passed,
      pending: false,
      details: passed
        ? `External examiner marks meet cut-offs: Novelty ${input.rubricFScore.novelty}/8, Problem ${input.rubricFScore.realisticProblem}/8, Impact ${input.rubricFScore.impactOnSociety}/3.`
        : `External examiner marks below cut-offs (Req: Nov>=6, Real>=6, Imp>=2). Actual: Nov ${input.rubricFScore.novelty}, Real ${input.rubricFScore.realisticProblem}, Imp ${input.rubricFScore.impactOnSociety}.`,
    };
  }

  // Step 4: Complexity declaration confirms attributes rubrics do not assess
  const step4: StepEvaluation = {
    passed: input.declarationsConfirmed,
    pending: false,
    details: input.declarationsConfirmed
      ? 'Complexity declaration confirms unassessed attributes (WP5, WP7, etc.).'
      : 'Complexity declaration pending supervisor sign-off.',
  };

  // Overall status resolution
  if (!step1.passed) {
    return {
      step1,
      step2,
      step3,
      step4,
      isCapstone: false,
      status: 'FAILED',
      summary: 'Project failed Step 1 (Topic Qualification). Cannot earn Capstone status.',
    };
  }

  if (step2.pending || step3.pending) {
    return {
      step1,
      step2,
      step3,
      step4,
      isCapstone: false,
      status: 'PENDING',
      summary: 'Evaluation marks incomplete across semesters. Capstone decision is pending.',
    };
  }

  if (!step2.passed || !step3.passed || !step4.passed) {
    return {
      step1,
      step2,
      step3,
      step4,
      isCapstone: false,
      status: 'FAILED',
      summary: 'Project evaluated but did not satisfy all Capstone cut-offs.',
    };
  }

  return {
    step1,
    step2,
    step3,
    step4,
    isCapstone: true,
    status: 'QUALIFIED',
    summary: 'Project successfully satisfied all 4 steps and earns official Capstone status.',
  };
}
