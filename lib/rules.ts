// ========================================================
// ECE Capstone Project Management System - Keyword Rule Engine
// Deterministic rule-based tagging baseline for WP, WK, EA and SDGs
// Used as baseline and fallback when AI providers are unavailable
// ========================================================

export interface RuleResult {
  levels: Record<string, number>;
  reasons: Record<string, string>;
  sdgs: Array<{ sdg: number; target: string; reason: string }>;
}

const KEYWORD_MAP: Record<
  string,
  {
    attributes: Array<{ code: string; level: number; reason: string }>;
    sdgs?: Array<{ sdg: number; target: string; reason: string }>;
  }
> = {
  // Antenna / EM / Microwave
  antenna: {
    attributes: [
      { code: 'WP1', level: 3, reason: 'Requires full-wave electromagnetic simulation and mathematical analysis.' },
      { code: 'WK1', level: 3, reason: 'Grounding in Maxwell equations and high-frequency electromagnetics.' },
      { code: 'WK8', level: 2, reason: 'Requires S-parameter network analyzer or anechoic chamber testing.' },
      { code: 'EA2', level: 2, reason: 'Employs CST Studio or HFSS commercial EM simulation tools.' },
    ],
    sdgs: [{ sdg: 9, target: '9.5', reason: 'Enhances telecommunications and scientific research infrastructure.' }],
  },
  // Sensor / IoT / Embedded
  sensor: {
    attributes: [
      { code: 'WP2', level: 2, reason: 'Involves multi-variable analog-to-digital signal acquisition and calibration.' },
      { code: 'WK5', level: 2, reason: 'Microcontroller firmware and peripheral interfacing design.' },
      { code: 'EA1', level: 2, reason: 'Hardware integration and physical environment deployment.' },
    ],
    sdgs: [{ sdg: 11, target: '11.6', reason: 'Environmental monitoring and smart urban telemetry.' }],
  },
  // FPGA / VLSI
  fpga: {
    attributes: [
      { code: 'WP1', level: 3, reason: 'Digital architecture optimization, pipelining, and timing closure.' },
      { code: 'WK3', level: 3, reason: 'Hardware Description Languages (Verilog/VHDL) synthesis.' },
      { code: 'WK6', level: 3, reason: 'FPGA development toolchains (Vivado/Quartus).' },
      { code: 'EA2', level: 3, reason: 'Hardware-in-the-loop validation and logic analysis.' },
    ],
    sdgs: [{ sdg: 9, target: '9.b', reason: 'High-performance hardware innovation and domestic manufacturing.' }],
  },
  // Solar / Energy
  solar: {
    attributes: [
      { code: 'WP6', level: 2, reason: 'Addresses clean energy integration and power efficiency.' },
      { code: 'WK7', level: 2, reason: 'Sustainable engineering practices and battery lifecycle considerations.' },
      { code: 'EA4', level: 2, reason: 'Direct mitigation of fossil fuel emissions.' },
    ],
    sdgs: [{ sdg: 7, target: '7.2', reason: 'Substantially increase the share of renewable energy.' }],
  },
  // Healthcare / Medical
  medical: {
    attributes: [
      { code: 'WP6', level: 3, reason: 'Critical safety margins, patient isolation, and medical device standards.' },
      { code: 'WK9', level: 3, reason: 'Biomedical ethics and regulatory privacy compliance.' },
      { code: 'EA4', level: 3, reason: 'Societal health diagnosis and patient monitoring.' },
    ],
    sdgs: [{ sdg: 3, target: '3.8', reason: 'Accessible diagnostic health tech and patient monitoring.' }],
  },
  // Agriculture
  agriculture: {
    attributes: [
      { code: 'WP6', level: 2, reason: 'Addresses agricultural productivity and soil conservation.' },
      { code: 'WK7', level: 2, reason: 'Ecological sustainability in farming ecosystems.' },
      { code: 'EA4', level: 2, reason: 'Food security enhancement through technology.' },
    ],
    sdgs: [{ sdg: 2, target: '2.4', reason: 'Sustainable food production systems and resilient practices.' }],
  },
};

/**
 * Runs deterministic rule-based analysis on title, description, and tags
 */
export function evaluateRules(title: string, description: string, tags: string[] = []): RuleResult {
  const content = `${title} ${description} ${tags.join(' ')}`.toLowerCase();

  const levels: Record<string, number> = {};
  const reasons: Record<string, string> = {};
  const sdgsMap: Map<number, { sdg: number; target: string; reason: string }> = new Map();

  // Baseline defaults: minimum assignment
  levels['WP1'] = 1;
  reasons['WP1'] = 'Baseline complex problem solving assessment.';

  for (const [keyword, rule] of Object.entries(KEYWORD_MAP)) {
    if (content.includes(keyword)) {
      for (const attr of rule.attributes) {
        if (!levels[attr.code] || attr.level > levels[attr.code]) {
          levels[attr.code] = attr.level;
          reasons[attr.code] = attr.reason;
        }
      }
      if (rule.sdgs) {
        for (const sdg of rule.sdgs) {
          sdgsMap.set(sdg.sdg, sdg);
        }
      }
    }
  }

  return {
    levels,
    reasons,
    sdgs: Array.from(sdgsMap.values()),
  };
}
