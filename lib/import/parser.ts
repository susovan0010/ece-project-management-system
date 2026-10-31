// ========================================================
// ECE Capstone Project Management System - Ingestion & Import Engine
// Parses CSV/XLSX workbooks, auto-detects columns, generates UGR codes,
// applies hardware/software keyword heuristics, and detects duplicates.
// ========================================================

export type TopicSourceType = 'SIH' | 'UG_RESEARCH' | 'FACULTY';
export type TopicCategoryType = 'Custom' | 'Software' | 'Hardware' | 'Both';

export interface ParsedTopicRow {
  code: string;
  title: string;
  source: TopicSourceType;
  category: TopicCategoryType;
  domain?: string;
  organization?: string;
  description: string;
  tags: string[];
  sdgIds: number[];
  isDuplicate?: boolean;
  duplicateReason?: string;
}

export const HARDWARE_KEYWORDS = [
  'fabrication',
  'antenna',
  'sensor',
  'fpga',
  'pcb',
  'rf',
  'vlsi',
  'microcontroller',
  'semiconductor',
  'embedded',
  'circuit',
  'iot device',
  'actuator',
  'transceiver',
];

/**
 * Predicts category (Hardware vs Software) using department keyword heuristic
 */
export function predictCategory(text: string): TopicCategoryType {
  const lower = text.toLowerCase();
  const hasHardware = HARDWARE_KEYWORDS.some((kw) => lower.includes(kw));

  // If text also strongly mentions cloud, web, ai software, or app
  const hasSoftware = ['deep learning', 'machine learning', 'cloud', 'web app', 'portal', 'software', 'algorithm'].some(
    (kw) => lower.includes(kw)
  );

  if (hasHardware && hasSoftware) return 'Both';
  if (hasHardware) return 'Hardware';
  return 'Software';
}

/**
 * Extracts SDG IDs (1..17) from text like "SDG 7, SDG 9", "7, 11", "Goal 3"
 */
export function parseSdgIds(raw: string | number | undefined | null): number[] {
  if (!raw) return [];
  const text = String(raw);
  const matches = text.match(/\b([1-9]|1[0-7])\b/g);
  if (!matches) return [];

  const unique = Array.from(new Set(matches.map((m) => parseInt(m, 10))));
  return unique.filter((n) => n >= 1 && n <= 17);
}

/**
 * Normalizes raw sheet data into ParsedTopicRow objects
 */
export function processRawImportData(
  rows: Record<string, unknown>[],
  sourceType: TopicSourceType,
  existingCodes: Set<string> = new Set(),
  existingTitles: Set<string> = new Set()
): ParsedTopicRow[] {
  const result: ParsedTopicRow[] = [];
  const seenBatchCodes = new Set<string>();
  const seenBatchTitles = new Set<string>();

  rows.forEach((row, index) => {
    // 1. Code Resolution
    let code = '';
    if (sourceType === 'SIH') {
      // Look for PS Number or Problem Statement ID
      const rawCode = (
        row['PS Number'] ||
        row['PS ID'] ||
        row['Problem Statement Number'] ||
        row['Code'] ||
        ''
      ) as string;
      if (String(rawCode).trim()) {
        code = String(rawCode).trim();
      } else {
        let seq = existingCodes.size + index + 1;
        while (
          existingCodes.has(`SIH26${String(seq).padStart(3, '0')}`) ||
          seenBatchCodes.has(`SIH26${String(seq).padStart(3, '0')}`)
        ) {
          seq++;
        }
        code = `SIH26${String(seq).padStart(3, '0')}`;
      }
    } else {
      // UG Research generates UGR-001...
      const rawCode = (row['Code'] || row['PS Number'] || '') as string;
      if (String(rawCode).trim()) {
        code = String(rawCode).trim();
      } else {
        let seq = index + 1;
        while (
          existingCodes.has(`UGR-${String(seq).padStart(3, '0')}`) ||
          seenBatchCodes.has(`UGR-${String(seq).padStart(3, '0')}`)
        ) {
          seq++;
        }
        code = `UGR-${String(seq).padStart(3, '0')}`;
      }
    }

    // 2. Title Resolution
    const title = (
      (row['Title'] ||
        row['Problem Statement Title'] ||
        row['Research Area'] ||
        row['Project Title'] ||
        `Untitled Project ${index + 1}`) as string
    ).trim();

    // 3. Category Resolution (Default is 'Custom' so the supervisor defines the project category)
    let category: TopicCategoryType = 'Custom';
    if (row['Category']) {
      const catStr = String(row['Category']).trim().toLowerCase();
      if (catStr.includes('custom')) category = 'Custom';
      else if (catStr.includes('hard') || catStr === 'hardware') category = 'Hardware';
      else if (catStr.includes('both') || catStr.includes('hybrid')) category = 'Both';
      else if (catStr.includes('soft') || catStr === 'software') category = 'Software';
      else category = 'Custom';
    } else {
      category = 'Custom';
    }

    // 4. Theme / Domain / Description
    const domain = (
      row['Theme'] ||
      row['theme'] ||
      row['Project Theme'] ||
      row['Domain'] ||
      row['Area'] ||
      row['Department']
    ) as string | undefined;
    const organization = (row['Organization'] || row['Organisation'] || row['Ministry'] || row['Dept']) as
      | string
      | undefined;
    const description = (
      (row['Description'] ||
        row['Problem Statement Description'] ||
        row['Objectives'] ||
        row['Abstract'] ||
        title) as string
    ).trim();

    // 5. Tags & SDGs
    const rawTags = (row['Keywords'] || row['Tags'] || '') as string;
    const tags = rawTags
      ? String(rawTags)
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const rawSdgs = row['Mapped SDG(s)'] || row['SDG'] || row['Mapped SDGs'] || row['SDGs'];
    const sdgIds = parseSdgIds(rawSdgs as string);

    // 6. Duplicate Detection
    const normalizedTitle = title.toLowerCase();
    const isDupCode = existingCodes.has(code) || seenBatchCodes.has(code);
    const isDupTitle = existingTitles.has(normalizedTitle) || seenBatchTitles.has(normalizedTitle);

    let isDuplicate = false;
    let duplicateReason = undefined;

    if (isDupCode) {
      isDuplicate = true;
      duplicateReason = `Duplicate Code: ${code}`;
    } else if (isDupTitle) {
      isDuplicate = true;
      duplicateReason = `Duplicate Title in catalogue`;
    }

    seenBatchCodes.add(code);
    seenBatchTitles.add(normalizedTitle);

    result.push({
      code,
      title,
      source: sourceType,
      category,
      domain: domain ? String(domain).trim() : undefined,
      organization: organization ? String(organization).trim() : undefined,
      description,
      tags,
      sdgIds,
      isDuplicate,
      duplicateReason,
    });
  });

  return result;
}
