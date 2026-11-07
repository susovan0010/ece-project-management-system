import { describe, it, expect } from 'vitest';
import { calculateStudentBadges } from '@/lib/engine/badge-engine';

describe('Forum Gamification Badge Engine', () => {
  it('handles zero or negative score with no badges and targets Iron at 10', () => {
    const zeroRes = calculateStudentBadges(0);
    expect(zeroRes.badges.length).toBe(0);
    expect(zeroRes.diamonds).toBe(0);
    expect(zeroRes.iron).toBe(0);
    expect(zeroRes.nextMilestone.targetMaterial).toBe('IRON');
    expect(zeroRes.nextMilestone.targetScore).toBe(10);
    expect(zeroRes.nextMilestone.pointsRemaining).toBe(10);

    const negRes = calculateStudentBadges(-5);
    expect(negRes.effectiveScore).toBe(0);
    expect(negRes.badges.length).toBe(0);
  });

  it('awards 1 Iron at 10 marks and targets Copper at 20', () => {
    const res = calculateStudentBadges(10);
    expect(res.iron).toBe(1);
    expect(res.copper).toBe(0);
    expect(res.silver).toBe(0);
    expect(res.gold).toBe(0);
    expect(res.diamonds).toBe(0);
    expect(res.nextMilestone.targetMaterial).toBe('COPPER');
    expect(res.nextMilestone.targetScore).toBe(20);
    expect(res.nextMilestone.pointsRemaining).toBe(10);
  });

  it('awards Copper at 20, Silver at 30, Gold at 40, and Diamond at 50', () => {
    const at20 = calculateStudentBadges(20);
    expect(at20.iron).toBe(1);
    expect(at20.copper).toBe(1);

    const at30 = calculateStudentBadges(30);
    expect(at30.iron).toBe(1);
    expect(at30.copper).toBe(1);
    expect(at30.silver).toBe(1);

    const at40 = calculateStudentBadges(40);
    expect(at40.iron).toBe(1);
    expect(at40.copper).toBe(1);
    expect(at40.silver).toBe(1);
    expect(at40.gold).toBe(1);

    const at50 = calculateStudentBadges(50);
    expect(at50.iron).toBe(1);
    expect(at50.copper).toBe(1);
    expect(at50.silver).toBe(1);
    expect(at50.gold).toBe(1);
    expect(at50.diamonds).toBe(1);
    expect(at50.nextMilestone.targetMaterial).toBe('IRON');
    expect(at50.nextMilestone.targetScore).toBe(60);
  });

  it('starts earning additional duplicates starting from Iron at 60 up to Gold at 90', () => {
    const at60 = calculateStudentBadges(60);
    expect(at60.iron).toBe(2);
    expect(at60.copper).toBe(1);
    expect(at60.silver).toBe(1);
    expect(at60.gold).toBe(1);
    expect(at60.diamonds).toBe(1);

    const at70 = calculateStudentBadges(70);
    expect(at70.iron).toBe(2);
    expect(at70.copper).toBe(2);

    const at80 = calculateStudentBadges(80);
    expect(at80.silver).toBe(2);

    const at90 = calculateStudentBadges(90);
    expect(at90.iron).toBe(2);
    expect(at90.copper).toBe(2);
    expect(at90.silver).toBe(2);
    expect(at90.gold).toBe(2);
    expect(at90.diamonds).toBe(1);
    expect(at90.nextMilestone.targetMaterial).toBe('TRIPLE_DIAMOND_CYCLE');
    expect(at90.nextMilestone.targetScore).toBe(100);
  });

  it('completing 100 markups grants exactly 3 Diamonds and clears all other materials', () => {
    const at100 = calculateStudentBadges(100);
    expect(at100.completedCycles).toBe(1);
    expect(at100.diamonds).toBe(3);
    expect(at100.gold).toBe(0);
    expect(at100.silver).toBe(0);
    expect(at100.copper).toBe(0);
    expect(at100.iron).toBe(0);
    // Next starts from 1 with 3 diamonds in account, targeting 110 (Iron)
    expect(at100.nextMilestone.targetMaterial).toBe('IRON');
    expect(at100.nextMilestone.targetScore).toBe(110);
  });

  it('cycles smoothly into next 100 with preserved 3 diamonds', () => {
    const at110 = calculateStudentBadges(110);
    expect(at110.diamonds).toBe(3);
    expect(at110.iron).toBe(1);
    expect(at110.copper).toBe(0);

    const at150 = calculateStudentBadges(150);
    expect(at150.diamonds).toBe(4); // 3 from first cycle + 1 at 50 in second cycle
    expect(at150.iron).toBe(1);
    expect(at150.copper).toBe(1);
    expect(at150.silver).toBe(1);
    expect(at150.gold).toBe(1);

    const at200 = calculateStudentBadges(200);
    expect(at200.completedCycles).toBe(2);
    expect(at200.diamonds).toBe(6);
    expect(at200.gold).toBe(0);
    expect(at200.silver).toBe(0);
    expect(at200.copper).toBe(0);
    expect(at200.iron).toBe(0);
  });
});
