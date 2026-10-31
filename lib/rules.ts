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
  // Disaster Management / Early Warning
  disaster: {
    attributes: [
      { code: 'WP1', level: 2, reason: 'Requires resilient multi-sensor early-warning and fault-tolerant communication design.' },
      { code: 'WP6', level: 3, reason: 'Public safety, emergency response, and disaster risk mitigation.' },
      { code: 'WK5', level: 2, reason: 'Engineering design of ruggedized telemetry and emergency alert systems.' },
      { code: 'WK7', level: 2, reason: 'Environmental and societal resilience under extreme conditions.' },
      { code: 'EA1', level: 2, reason: 'Deployment of real-time field monitoring and emergency coordination resources.' },
      { code: 'EA4', level: 3, reason: 'High-consequence protection of human life and infrastructure.' },
    ],
    sdgs: [{ sdg: 11, target: '11.5', reason: 'Reduce adverse impacts of natural disasters and protect vulnerable populations.' }],
  },
  // Transportation & Logistics / Traffic / Mobility
  transport: {
    attributes: [
      { code: 'WP1', level: 2, reason: 'Involves real-time tracking, routing optimization, and vehicular telemetry.' },
      { code: 'WP2', level: 2, reason: 'Balances latency, throughput, energy consumption, and safety constraints.' },
      { code: 'WK3', level: 2, reason: 'Rooted in control systems, GNSS/RFID tracking, and communication protocols.' },
      { code: 'WK5', level: 2, reason: 'System-level design of intelligent transportation and logistics networks.' },
      { code: 'EA2', level: 2, reason: 'Integration of heterogeneous hardware/software tracking and fleet management modules.' },
    ],
    sdgs: [{ sdg: 9, target: '9.1', reason: 'Develop sustainable, resilient, and efficient transportation and logistics systems.' }],
  },
  logistics: {
    attributes: [
      { code: 'WP2', level: 2, reason: 'Supply-chain telemetry and multi-constraint routing optimization.' },
      { code: 'WK5', level: 2, reason: 'End-to-end embedded and cloud system architecture for asset tracking.' },
      { code: 'EA1', level: 2, reason: 'Coordinated management of distributed sensors, tags, and gateways.' },
    ],
    sdgs: [{ sdg: 9, target: '9.1', reason: 'Resilient supply-chain and logistics infrastructure.' }],
  },
  // AI / Machine Learning / Signal & Image Processing
  learning: {
    attributes: [
      { code: 'WP1', level: 2, reason: 'Mathematical modeling, feature extraction, and statistical inference.' },
      { code: 'WP3', level: 2, reason: 'Algorithmic formulation and hyperparameter trade-off optimization.' },
      { code: 'WK2', level: 2, reason: 'Probability, linear algebra, and statistical signal processing.' },
      { code: 'WK6', level: 2, reason: 'Modern machine learning frameworks and computational toolchains.' },
      { code: 'WK8', level: 2, reason: 'Dataset curation, cross-validation, and empirical benchmarking.' },
      { code: 'EA2', level: 2, reason: 'Training and deployment of data-driven inference pipelines.' },
    ],
    sdgs: [{ sdg: 9, target: '9.5', reason: 'Technological upgrading and data-driven engineering research.' }],
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

  // Baseline defaults: ensure every engineering project has core WP, WK, and EA representation
  levels['WP1'] = 2;
  reasons['WP1'] = 'Core ECE engineering problem formulation and analytical depth.';
  levels['WP2'] = 2;
  reasons['WP2'] = 'Addresses trade-offs in performance, cost, power, and implementation.';
  levels['WK3'] = 2;
  reasons['WK3'] = 'Applies core electronics, communication, or computing engineering fundamentals.';
  levels['WK5'] = 2;
  reasons['WK5'] = 'Involves system-level engineering design and architecture.';
  levels['EA1'] = 2;
  reasons['EA1'] = 'Utilizes hardware/software engineering resources, components, and datasets.';

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
