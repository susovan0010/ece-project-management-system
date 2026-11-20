// ==========================================
// ECE Capstone Project Management System
// 7th Semester Evaluation Panel Generator Engine
// ==========================================

import { ECE_DOMAIN_CATEGORIES } from '@/lib/constants/domains';

export interface PanelFacultyCandidate {
  id: string;
  name: string;
  email: string;
  role: 'FACULTY' | 'ADMIN';
  domainExpertise: string[];
}

export interface PanelGroupCandidate {
  id: string;
  number: number;
  batchId: string;
  topicId: string;
  topicCode: string;
  topicTitle: string;
  topicCategory?: string;
  topicDomain?: string;
  topicTags?: string[];
  supervisorId: string;
  supervisorName: string;
  studentNames: string[];
}

export interface GeneratedPanel {
  panelNumber: number;
  roomNumber?: string;
  members: PanelFacultyCandidate[];
  groups: PanelGroupCandidate[];
  coveredCategories: string[];
  coveredDomainsCount: number;
  forbiddenSupervisorIds: string[];
}

export interface PanelGenerationResult {
  success: boolean;
  error?: string;
  panelCount: number;
  totalGroups: number;
  totalFaculty: number;
  reservedMTechCount: number;
  availableFacultyCount: number;
  groupsPerPanelAvg: number;
  membersPerPanelAvg: number;
  panels: GeneratedPanel[];
  conflictsDetected: number;
  unassignedGroups: PanelGroupCandidate[];
}

/**
 * 1. Compute total number of panels P = ceil(G / 10).
 * Maximum 10 groups per panel.
 */
export function calculatePanelCount(totalGroups: number, maxGroupsPerPanel = 10): number {
  if (totalGroups <= 0) return 0;
  return Math.ceil(totalGroups / maxGroupsPerPanel);
}

/**
 * 2. Uniformly distribute total items among parts such that max - min <= 1.
 */
export function calculateQuotas(total: number, parts: number): number[] {
  if (parts <= 0 || total <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total % parts;

  const quotas: number[] = [];
  for (let i = 0; i < parts; i++) {
    quotas.push(i < remainder ? base + 1 : base);
  }
  return quotas;
}

/**
 * Helper: Find categories touched by a faculty's domain expertise
 */
function getFacultyCategoryIds(domains: string[]): string[] {
  const matched = new Set<string>();
  ECE_DOMAIN_CATEGORIES.forEach((cat) => {
    if (cat.domains.some((d) => domains.includes(d))) {
      matched.add(cat.id);
    }
  });
  return Array.from(matched);
}

/**
 * 3. Distribute available faculty across panels to maximize domain diversity.
 */
export function distributeFacultyByDomainDiversity(
  availableFaculty: PanelFacultyCandidate[],
  panelCount: number
): { members: PanelFacultyCandidate[]; coveredCategories: Set<string>; coveredDomains: Set<string> }[] {
  if (panelCount <= 0) return [];

  const facultyQuotas = calculateQuotas(availableFaculty.length, panelCount);
  const panelHolders = Array.from({ length: panelCount }, (_, idx) => ({
    members: [] as PanelFacultyCandidate[],
    coveredCategories: new Set<string>(),
    coveredDomains: new Set<string>(),
    capacity: facultyQuotas[idx] || 0,
  }));

  // Sort faculty by diversity contribution (more domains first)
  const sortedFaculty = [...availableFaculty].sort((a, b) => {
    return b.domainExpertise.length - a.domainExpertise.length;
  });

  for (const faculty of sortedFaculty) {
    const facultyCats = getFacultyCategoryIds(faculty.domainExpertise);

    // Score each panel that has remaining capacity
    let bestPanelIdx = -1;
    let highestScore = -Infinity;

    for (let i = 0; i < panelCount; i++) {
      const panel = panelHolders[i];
      if (panel.members.length >= panel.capacity) continue;

      // Calculate marginal domain and category gain vs duplicate domain penalty
      let newCatsGain = 0;
      facultyCats.forEach((c) => {
        if (!panel.coveredCategories.has(c)) newCatsGain++;
      });

      let newDomainsGain = 0;
      let duplicateDomainCount = 0;
      faculty.domainExpertise.forEach((d) => {
        if (!panel.coveredDomains.has(d)) newDomainsGain++;
        else duplicateDomainCount++;
      });

      // Score: prioritize covering new domains & categories evenly across all panels,
      // avoid stacking identical domains in the same panel, and balance member counts.
      const score =
        newCatsGain * 12 +
        newDomainsGain * 5 -
        duplicateDomainCount * 3 -
        panel.members.length * 2;

      if (score > highestScore) {
        highestScore = score;
        bestPanelIdx = i;
      }
    }

    // Fallback if capacities were reached or tie
    if (bestPanelIdx === -1) {
      // Find any panel with smallest count
      let minCount = Infinity;
      for (let i = 0; i < panelCount; i++) {
        if (panelHolders[i].members.length < minCount) {
          minCount = panelHolders[i].members.length;
          bestPanelIdx = i;
        }
      }
    }

    if (bestPanelIdx !== -1) {
      const targetPanel = panelHolders[bestPanelIdx];
      targetPanel.members.push(faculty);
      facultyCats.forEach((c) => targetPanel.coveredCategories.add(c));
      faculty.domainExpertise.forEach((d) => targetPanel.coveredDomains.add(d));
    }
  }

  return panelHolders;
}

const STOP_TOKENS = new Set(['and', 'the', 'for', 'with', 'using', 'based', 'system', 'systems', 'design', 'analysis']);

function tokenizeKeywords(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t));
}

/**
 * Counts how many distinct domain expertises of a panel's members match
 * a project's Technical Keywords (tags) and/or Project Theme (domain).
 */
export function countGroupPanelDomainMatches(
  group: PanelGroupCandidate,
  panelMembers: PanelFacultyCandidate[]
): number {
  const distinctDomains = new Set<string>();
  for (const m of panelMembers) {
    for (const d of m.domainExpertise || []) {
      if (d.trim()) distinctDomains.add(d.trim());
    }
  }
  if (distinctDomains.size === 0) return 0;

  const projectPhrases = [
    ...(group.topicTags || []),
    ...(group.topicDomain ? group.topicDomain.split(/[,/&;]+/) : []),
  ]
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length >= 2);

  const projectTokens = new Set<string>([
    ...tokenizeKeywords(group.topicDomain || ''),
    ...tokenizeKeywords((group.topicTags || []).join(' ')),
  ]);

  // Fallback to title tokens only when neither domain nor tags were provided
  if (projectTokens.size === 0 && projectPhrases.length === 0) {
    for (const tok of tokenizeKeywords(group.topicTitle || '')) {
      projectTokens.add(tok);
    }
  }

  let matchCount = 0;
  for (const domain of Array.from(distinctDomains)) {
    const domLower = domain.toLowerCase();
    const domTokens = tokenizeKeywords(domain);

    const phraseMatch = projectPhrases.some(
      (p) => domLower.includes(p) || p.includes(domLower)
    );
    const tokenMatch = domTokens.some((dt) => projectTokens.has(dt));

    if (phraseMatch || tokenMatch) {
      matchCount++;
    }
  }

  return matchCount;
}

/**
 * 4. Assign groups to panels strictly enforcing that no member evaluates their own group,
 * while prioritizing panels where at least 2 domain expertises of panel members match
 * the project's Technical Keywords and/or Project Theme.
 */
export function assignGroupsStrictlyNoSelfSupervision(
  groups: PanelGroupCandidate[],
  panelMembers: { members: PanelFacultyCandidate[]; panelIndex: number }[],
  groupQuotas: number[]
): { panelGroups: PanelGroupCandidate[][]; unassigned: PanelGroupCandidate[]; conflicts: number } {
  const panelCount = panelMembers.length;
  if (panelCount === 0 || groups.length === 0) {
    return { panelGroups: [], unassigned: groups, conflicts: 0 };
  }

  // Precompute forbidden supervisors for each panel
  const forbiddenMap = new Map<number, Set<string>>();
  panelMembers.forEach((p) => {
    const set = new Set<string>();
    p.members.forEach((m) => set.add(m.id));
    forbiddenMap.set(p.panelIndex, set);
  });

  const assigned = Array.from({ length: panelCount }, () => [] as PanelGroupCandidate[]);
  const unassigned: PanelGroupCandidate[] = [];

  // Precompute domain match scores (groupId -> panelIndex -> matchCount)
  const matchCache = new Map<string, number[]>();
  for (const g of groups) {
    const scores = panelMembers.map((pm) => countGroupPanelDomainMatches(g, pm.members));
    matchCache.set(g.id, scores);
  }

  // Sort groups: most constrained first (highest supervisor conflicts, then fewest panels with >=2 domain matches)
  const sortedGroups = [...groups].sort((a, b) => {
    let aConflictCount = 0;
    let bConflictCount = 0;
    let aTwoMatchCount = 0;
    let bTwoMatchCount = 0;
    const aScores = matchCache.get(a.id) || [];
    const bScores = matchCache.get(b.id) || [];
    for (let i = 0; i < panelCount; i++) {
      if (forbiddenMap.get(i)?.has(a.supervisorId)) aConflictCount++;
      else if ((aScores[i] || 0) >= 2) aTwoMatchCount++;
      if (forbiddenMap.get(i)?.has(b.supervisorId)) bConflictCount++;
      else if ((bScores[i] || 0) >= 2) bTwoMatchCount++;
    }
    if (bConflictCount !== aConflictCount) return bConflictCount - aConflictCount;
    return aTwoMatchCount - bTwoMatchCount;
  });

  // Assign groups preferring panels with >= 2 domain matches & balanced quota
  for (const group of sortedGroups) {
    const scores = matchCache.get(group.id) || [];
    let bestPanelIdx = -1;
    let bestCompositeScore = -Infinity;

    // Find allowable panel that hasn't reached its quota
    for (let pIdx = 0; pIdx < panelCount; pIdx++) {
      const isForbidden = forbiddenMap.get(pIdx)?.has(group.supervisorId);
      if (isForbidden) continue;

      const currentCount = assigned[pIdx].length;
      const targetQuota = groupQuotas[pIdx];

      if (currentCount < targetQuota) {
        const domainMatches = scores[pIdx] || 0;
        const meetsTwoDomainRule = domainMatches >= 2 ? 1000 : domainMatches * 100;
        const compositeScore = meetsTwoDomainRule + domainMatches * 10 - currentCount * 5;
        if (compositeScore > bestCompositeScore) {
          bestCompositeScore = compositeScore;
          bestPanelIdx = pIdx;
        }
      }
    }

    if (bestPanelIdx !== -1) {
      assigned[bestPanelIdx].push(group);
    } else {
      // Try swap: find a panel that is full, but has a group that can move to another eligible panel
      let swapped = false;
      for (let pIdx = 0; pIdx < panelCount; pIdx++) {
        if (forbiddenMap.get(pIdx)?.has(group.supervisorId)) continue;

        // Check if we can move an existing group from pIdx to another panel k
        for (let gIdx = 0; gIdx < assigned[pIdx].length; gIdx++) {
          const candidateGroup = assigned[pIdx][gIdx];
          // Can candidateGroup move to any other panel k that has space and no conflict?
          for (let k = 0; k < panelCount; k++) {
            if (k === pIdx) continue;
            if (forbiddenMap.get(k)?.has(candidateGroup.supervisorId)) continue;
            if (assigned[k].length < groupQuotas[k]) {
              // Perform swap!
              assigned[k].push(candidateGroup);
              assigned[pIdx].splice(gIdx, 1);
              assigned[pIdx].push(group);
              swapped = true;
              break;
            }
          }
          if (swapped) break;
        }
        if (swapped) break;
      }

      if (!swapped) {
        // If still no spot without violating quota or supervisor, add to any non-conflicting panel
        for (let pIdx = 0; pIdx < panelCount; pIdx++) {
          if (!forbiddenMap.get(pIdx)?.has(group.supervisorId)) {
            assigned[pIdx].push(group);
            swapped = true;
            break;
          }
        }
      }

      if (!swapped) {
        unassigned.push(group);
      }
    }
  }

  // Count any remaining conflicts (must be 0)
  let conflicts = 0;
  for (let pIdx = 0; pIdx < panelCount; pIdx++) {
    const forbidden = forbiddenMap.get(pIdx);
    assigned[pIdx].forEach((g) => {
      if (forbidden?.has(g.supervisorId)) {
        conflicts++;
      }
    });
  }

  return { panelGroups: assigned, unassigned, conflicts };
}

/**
 * Master orchestrator for generating 7th Sem Panels
 */
export function generateSem7Panels(params: {
  groups: PanelGroupCandidate[];
  faculty: PanelFacultyCandidate[];
  reservedMTechIds?: string[];
  maxGroupsPerPanel?: number;
  roomNumbers?: string[];
}): PanelGenerationResult {
  const { groups, faculty, reservedMTechIds = [], maxGroupsPerPanel = 10, roomNumbers } = params;

  const reservedSet = new Set(reservedMTechIds);
  const availableFaculty = faculty.filter((f) => !reservedSet.has(f.id));

  const totalGroups = groups.length;
  const totalFaculty = faculty.length;
  const reservedMTechCount = reservedSet.size;
  const availableFacultyCount = availableFaculty.length;

  if (totalGroups === 0) {
    return {
      success: false,
      error: 'No project groups found for this batch.',
      panelCount: 0,
      totalGroups: 0,
      totalFaculty,
      reservedMTechCount,
      availableFacultyCount,
      groupsPerPanelAvg: 0,
      membersPerPanelAvg: 0,
      panels: [],
      conflictsDetected: 0,
      unassignedGroups: [],
    };
  }

  const panelCount = calculatePanelCount(totalGroups, maxGroupsPerPanel);

  if (roomNumbers !== undefined) {
    const cleanRooms = roomNumbers.map((r) => r.trim()).filter(Boolean);
    if (cleanRooms.length !== panelCount) {
      return {
        success: false,
        error: `Please provide exactly ${panelCount} comma-separated room number(s) (1 per panel). You provided ${cleanRooms.length}.`,
        panelCount,
        totalGroups,
        totalFaculty,
        reservedMTechCount,
        availableFacultyCount,
        groupsPerPanelAvg: 0,
        membersPerPanelAvg: 0,
        panels: [],
        conflictsDetected: 0,
        unassignedGroups: [],
      };
    }
  }

  if (availableFacultyCount < panelCount) {
    return {
      success: false,
      error: `Not enough available faculty (${availableFacultyCount}) to form ${panelCount} panels. Please unreserve some M.Tech faculty.`,
      panelCount,
      totalGroups,
      totalFaculty,
      reservedMTechCount,
      availableFacultyCount,
      groupsPerPanelAvg: 0,
      membersPerPanelAvg: 0,
      panels: [],
      conflictsDetected: 0,
      unassignedGroups: [],
    };
  }

  // 1. Quotas
  const groupQuotas = calculateQuotas(totalGroups, panelCount);

  // 2. Distribute Faculty by Domain Diversity
  const distributedPanels = distributeFacultyByDomainDiversity(availableFaculty, panelCount);

  const panelMembersWithIndex = distributedPanels.map((p, idx) => ({
    members: p.members,
    panelIndex: idx,
  }));

  // 3. Distribute Groups with strict non-self-supervision
  const { panelGroups, unassigned, conflicts } = assignGroupsStrictlyNoSelfSupervision(
    groups,
    panelMembersWithIndex,
    groupQuotas
  );

  // 4. Construct final structured panels
  const finalPanels: GeneratedPanel[] = distributedPanels.map((dp, idx) => {
    const assignedForPanel = panelGroups[idx] || [];
    const forbidden = dp.members.map((m) => m.id);

    return {
      panelNumber: idx + 1,
      roomNumber: roomNumbers?.[idx]?.trim() || undefined,
      members: dp.members,
      groups: assignedForPanel,
      coveredCategories: Array.from(dp.coveredCategories),
      coveredDomainsCount: dp.coveredDomains.size,
      forbiddenSupervisorIds: forbidden,
    };
  });

  return {
    success: conflicts === 0 && unassigned.length === 0,
    error:
      conflicts > 0
        ? `Detected ${conflicts} conflict(s) where supervisor was in evaluation panel.`
        : unassigned.length > 0
        ? `Could not assign ${unassigned.length} group(s) without violating constraints.`
        : undefined,
    panelCount,
    totalGroups,
    totalFaculty,
    reservedMTechCount,
    availableFacultyCount,
    groupsPerPanelAvg: Number((totalGroups / panelCount).toFixed(1)),
    membersPerPanelAvg: Number((availableFacultyCount / panelCount).toFixed(1)),
    panels: finalPanels,
    conflictsDetected: conflicts,
    unassignedGroups: unassigned,
  };
}
