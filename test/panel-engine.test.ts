// ========================================================
// ECE Capstone Project Management System - Panel Engine Unit Tests
// Tests panel count, group balancing, domain diversity, and strict conflict avoidance.
// ========================================================

import { describe, it, expect } from 'vitest';
import {
  calculatePanelCount,
  calculateQuotas,
  distributeFacultyByDomainDiversity,
  assignGroupsStrictlyNoSelfSupervision,
  generateSem7Panels,
  PanelFacultyCandidate,
  PanelGroupCandidate,
} from '../lib/engine/panel-generator';

describe('Panel Generator Pure Engine: Mathematical Calculations', () => {
  it('calculates P = ceil(G / 10) correctly', () => {
    expect(calculatePanelCount(0)).toBe(0);
    expect(calculatePanelCount(5)).toBe(1);
    expect(calculatePanelCount(10)).toBe(1);
    expect(calculatePanelCount(11)).toBe(2);
    expect(calculatePanelCount(20)).toBe(2);
    expect(calculatePanelCount(25)).toBe(3);
    expect(calculatePanelCount(30)).toBe(3);
    expect(calculatePanelCount(31)).toBe(4);
  });

  it('balances quotas so difference between any two panels is at most 1', () => {
    const q1 = calculateQuotas(25, 3);
    expect(q1).toEqual([9, 8, 8]);
    expect(q1.reduce((a, b) => a + b, 0)).toBe(25);
    expect(Math.max(...q1) - Math.min(...q1)).toBeLessThanOrEqual(1);

    const q2 = calculateQuotas(28, 3);
    expect(q2).toEqual([10, 9, 9]);
    expect(q2.reduce((a, b) => a + b, 0)).toBe(28);

    const q3 = calculateQuotas(34, 4);
    expect(q3).toEqual([9, 9, 8, 8]);
    expect(q3.reduce((a, b) => a + b, 0)).toBe(34);
    expect(Math.max(...q3) - Math.min(...q3)).toBeLessThanOrEqual(1);
  });
});

describe('Panel Generator: Strict Conflict of Interest Exclusion', () => {
  const mockFaculty: PanelFacultyCandidate[] = [
    {
      id: 'fac-1',
      name: 'Dr. Debasish Saha',
      email: 'debasish@hitk.edu',
      role: 'FACULTY',
      domainExpertise: ['5G Communication', 'Antenna', 'Wireless Sensor Networks'],
    },
    {
      id: 'fac-2',
      name: 'Prof. Ananya Chattopadhyay',
      email: 'ananya@heritageit.edu',
      role: 'FACULTY',
      domainExpertise: ['Analog VLSI', 'Digital VLSI', 'EDA'],
    },
    {
      id: 'fac-3',
      name: 'Dr. Susovan Mandal',
      email: 'susovan.mandal@heritageit.edu',
      role: 'ADMIN',
      domainExpertise: ['AI and ML', 'Python', 'Machine Intelligence'],
    },
    {
      id: 'fac-4',
      name: 'Dr. Subhashish Roy',
      email: 'subhashish@heritageit.edu',
      role: 'FACULTY',
      domainExpertise: ['Embedded System', 'IOT', 'Microprocessor and Microcontroller'],
    },
    {
      id: 'fac-5',
      name: 'Dr. Soumyo Chatterjee',
      email: 'soumyo@heritageit.edu',
      role: 'FACULTY',
      domainExpertise: ['Digital Signal Processing', 'Signal and Systems', 'C and C++'],
    },
    {
      id: 'fac-6',
      name: 'Dr. MTech Reserved',
      email: 'mtech.reserved@heritageit.edu',
      role: 'FACULTY',
      domainExpertise: ['Microwave Engineering', 'Radar'],
    },
  ];

  const mockGroups: PanelGroupCandidate[] = Array.from({ length: 22 }, (_, idx) => {
    // Distribute supervisors across fac-1 to fac-5
    const supIndex = idx % 5;
    const sup = mockFaculty[supIndex];
    return {
      id: `grp-${idx + 1}`,
      number: idx + 1,
      batchId: '2023-2027',
      topicId: `topic-${idx + 1}`,
      topicCode: `ECE-26-0${idx + 1}`,
      topicTitle: `Project Topic ${idx + 1}`,
      supervisorId: sup.id,
      supervisorName: sup.name,
      studentNames: [`Student ${idx + 1}A`, `Student ${idx + 1}B`],
    };
  });

  it('generates panels where NO member ever judges their own supervised group', () => {
    const result = generateSem7Panels({
      groups: mockGroups,
      faculty: mockFaculty,
      reservedMTechIds: ['fac-6'], // Reserve 1 faculty for M.Tech
      maxGroupsPerPanel: 10,
    });

    expect(result.success).toBe(true);
    expect(result.panelCount).toBe(3); // ceil(22 / 10) = 3
    expect(result.reservedMTechCount).toBe(1);
    expect(result.availableFacultyCount).toBe(5);
    expect(result.conflictsDetected).toBe(0);
    expect(result.unassignedGroups.length).toBe(0);

    // Verify each panel's groups and members
    result.panels.forEach((panel) => {
      const memberIds = new Set(panel.members.map((m) => m.id));

      // 1. M.Tech reserved faculty must NOT be in any panel
      expect(memberIds.has('fac-6')).toBe(false);

      // 2. Strict Checkpoint: NONE of the groups in this panel can have a supervisor in memberIds
      panel.groups.forEach((group) => {
        expect(memberIds.has(group.supervisorId)).toBe(false);
      });
    });

    // Verify total groups matches
    const totalAssigned = result.panels.reduce((sum, p) => sum + p.groups.length, 0);
    expect(totalAssigned).toBe(22);

    // Verify group balance: quotas for 22 groups over 3 panels should be 8, 7, 7
    const groupCounts = result.panels.map((p) => p.groups.length);
    expect(Math.max(...groupCounts) - Math.min(...groupCounts)).toBeLessThanOrEqual(1);
  });

  it('distributes faculty to ensure diverse domain coverage across panels', () => {
    const result = generateSem7Panels({
      groups: mockGroups,
      faculty: mockFaculty,
      reservedMTechIds: [],
      maxGroupsPerPanel: 10,
    });

    expect(result.success).toBe(true);
    result.panels.forEach((panel) => {
      expect(panel.members.length).toBeGreaterThan(0);
      expect(panel.coveredCategories.length).toBeGreaterThan(0);
    });
  });

  it('returns clean error when available faculty is less than panel count', () => {
    const result = generateSem7Panels({
      groups: mockGroups, // 22 groups -> 3 panels required
      faculty: [mockFaculty[0]], // Only 1 faculty available
      reservedMTechIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not enough available faculty');
  });
});
