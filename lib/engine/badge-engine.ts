// ==========================================
// ECE Capstone Project Management System
// Student Forum Gamification Badge Engine
// Pure Engine Functions
// ==========================================

export type BadgeMaterial = 'IRON' | 'COPPER' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface BadgeInventoryItem {
  material: BadgeMaterial;
  count: number;
  label: string;
  icon: string;
  color: string;
  bgLight: string;
  borderColor: string;
  description: string;
}

export interface NextBadgeMilestone {
  targetMaterial: BadgeMaterial | 'TRIPLE_DIAMOND_CYCLE';
  targetScore: number;
  pointsRemaining: number;
  progressPercent: number;
}

export interface StudentBadgeSummary {
  totalScore: number;
  effectiveScore: number;
  completedCycles: number; // Number of 100-mark cycles completed
  diamonds: number;
  gold: number;
  silver: number;
  copper: number;
  iron: number;
  badges: BadgeInventoryItem[];
  nextMilestone: NextBadgeMilestone;
}

export const BADGE_DEFINITIONS: Record<
  BadgeMaterial,
  { label: string; icon: string; color: string; bgLight: string; borderColor: string; description: string }
> = {
  IRON: {
    label: 'Iron Contributor',
    icon: '⚙️',
    color: '#64748B', // slate
    bgLight: '#F1F5F9',
    borderColor: '#CBD5E1',
    description: 'Awarded for consistent technical participation and query initiation.',
  },
  COPPER: {
    label: 'Copper Contributor',
    icon: '🥉',
    color: '#B45309', // amber/bronze
    bgLight: '#FEF3C7',
    borderColor: '#FDE68A',
    description: 'Awarded for active analytical discussions and group collaboration.',
  },
  SILVER: {
    label: 'Silver Scholar',
    icon: '🥈',
    color: '#0284C7', // sky/silver
    bgLight: '#E0F2FE',
    borderColor: '#BAE6FD',
    description: 'Awarded for rigorous literature exploration and technical depth.',
  },
  GOLD: {
    label: 'Gold Innovator',
    icon: '🥇',
    color: '#D97706', // gold
    bgLight: '#FEF9C3',
    borderColor: '#FDE047',
    description: 'Awarded for outstanding problem-solving and architectural insights.',
  },
  DIAMOND: {
    label: 'Diamond Pioneer',
    icon: '💎',
    color: '#0D9488', // teal/diamond
    bgLight: '#CCFBF1',
    borderColor: '#99F6E4',
    description: 'Mastery tier: awarded for sustained research excellence and leadership.',
  },
};

/**
 * Calculates badge inventory and next milestone progress from raw supervisor net markups.
 * Score is clamped to minimum 0.
 */
export function calculateStudentBadges(rawScore: number): StudentBadgeSummary {
  const effectiveScore = Math.max(0, Math.floor(rawScore || 0));

  const completedCycles = Math.floor(effectiveScore / 100);
  const cycleRemainder = effectiveScore % 100;

  // Base diamonds from completed 100-mark cycles:
  // Each completed 100-mark cycle converts lower materials + earned double diamonds into 3 Diamonds.
  let diamonds = completedCycles * 3;
  let gold = 0;
  let silver = 0;
  let copper = 0;
  let iron = 0;

  // Phase 1 (10-50): 1 of each material
  if (cycleRemainder >= 10) iron += 1;
  if (cycleRemainder >= 20) copper += 1;
  if (cycleRemainder >= 30) silver += 1;
  if (cycleRemainder >= 40) gold += 1;
  if (cycleRemainder >= 50) diamonds += 1;

  // Phase 2 (60-90): Additional duplicate of each material
  if (cycleRemainder >= 60) iron += 1;
  if (cycleRemainder >= 70) copper += 1;
  if (cycleRemainder >= 80) silver += 1;
  if (cycleRemainder >= 90) gold += 1;

  // Next Milestone determination
  let targetMaterial: BadgeMaterial | 'TRIPLE_DIAMOND_CYCLE' = 'IRON';
  let targetScore = 10;

  if (cycleRemainder < 10) {
    targetMaterial = 'IRON';
    targetScore = completedCycles * 100 + 10;
  } else if (cycleRemainder < 20) {
    targetMaterial = 'COPPER';
    targetScore = completedCycles * 100 + 20;
  } else if (cycleRemainder < 30) {
    targetMaterial = 'SILVER';
    targetScore = completedCycles * 100 + 30;
  } else if (cycleRemainder < 40) {
    targetMaterial = 'GOLD';
    targetScore = completedCycles * 100 + 40;
  } else if (cycleRemainder < 50) {
    targetMaterial = 'DIAMOND';
    targetScore = completedCycles * 100 + 50;
  } else if (cycleRemainder < 60) {
    targetMaterial = 'IRON';
    targetScore = completedCycles * 100 + 60;
  } else if (cycleRemainder < 70) {
    targetMaterial = 'COPPER';
    targetScore = completedCycles * 100 + 70;
  } else if (cycleRemainder < 80) {
    targetMaterial = 'SILVER';
    targetScore = completedCycles * 100 + 80;
  } else if (cycleRemainder < 90) {
    targetMaterial = 'GOLD';
    targetScore = completedCycles * 100 + 90;
  } else {
    // Between 90 and 99, target is 100 (completion of cycle with double diamond -> 3 diamonds)
    targetMaterial = 'TRIPLE_DIAMOND_CYCLE';
    targetScore = completedCycles * 100 + 100;
  }

  const stepStart = targetScore - 10;
  const currentStepProgress = effectiveScore - stepStart;
  const progressPercent = Math.min(100, Math.max(0, (currentStepProgress / 10) * 100));
  const pointsRemaining = Math.max(0, targetScore - effectiveScore);

  const badges: BadgeInventoryItem[] = [];

  if (diamonds > 0) {
    badges.push({
      material: 'DIAMOND',
      count: diamonds,
      ...BADGE_DEFINITIONS.DIAMOND,
    });
  }
  if (gold > 0) {
    badges.push({
      material: 'GOLD',
      count: gold,
      ...BADGE_DEFINITIONS.GOLD,
    });
  }
  if (silver > 0) {
    badges.push({
      material: 'SILVER',
      count: silver,
      ...BADGE_DEFINITIONS.SILVER,
    });
  }
  if (copper > 0) {
    badges.push({
      material: 'COPPER',
      count: copper,
      ...BADGE_DEFINITIONS.COPPER,
    });
  }
  if (iron > 0) {
    badges.push({
      material: 'IRON',
      count: iron,
      ...BADGE_DEFINITIONS.IRON,
    });
  }

  return {
    totalScore: rawScore,
    effectiveScore,
    completedCycles,
    diamonds,
    gold,
    silver,
    copper,
    iron,
    badges,
    nextMilestone: {
      targetMaterial,
      targetScore,
      pointsRemaining,
      progressPercent,
    },
  };
}
