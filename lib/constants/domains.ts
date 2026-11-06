// ==========================================
// ECE Academic & Research Domain Catalog
// ==========================================

export interface DomainCategory {
  id: string;
  name: string;
  description: string;
  color: {
    bg: string;
    border: string;
    text: string;
    badge: string;
  };
  domains: string[];
}

export const ECE_DOMAIN_CATEGORIES: DomainCategory[] = [
  {
    id: 'comm-rf',
    name: 'Communications & RF / Microwave',
    description: 'Wireless, RF, optical and satellite communication technologies',
    color: {
      bg: 'bg-sky-50/60',
      border: 'border-sky-200',
      text: 'text-sky-900',
      badge: 'bg-sky-100 text-sky-800 border-sky-300',
    },
    domains: [
      'Analog Communication',
      'Digital Communication',
      'Microwave Engineering',
      'Antenna',
      'Satellite Communication',
      '5G Communication',
      'Mobile Communication and Networks',
      'Optical Communication',
      'Fibre Optics',
      'Cognitive Radio',
      'Radar',
    ],
  },
  {
    id: 'circuits-systems',
    name: 'Circuits, Systems & Control',
    description: 'Fundamental circuit design, signal processing, and dynamic control',
    color: {
      bg: 'bg-emerald-50/60',
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    domains: [
      'Circuit Theory and Network',
      'Analog Electronics Circuits',
      'Digital Electronics',
      'Signal and Systems',
      'Control System',
      'Information Theory and Coding',
    ],
  },
  {
    id: 'vlsi-devices',
    name: 'VLSI, Microelectronics & Devices',
    description: 'Semiconductor devices, EDA automation, and nano/photovoltaic hardware',
    color: {
      bg: 'bg-purple-50/60',
      border: 'border-purple-200',
      text: 'text-purple-900',
      badge: 'bg-purple-100 text-purple-800 border-purple-300',
    },
    domains: [
      'Solid State Electron Devices',
      'Analog VLSI',
      'Digital VLSI',
      'EDA',
      'Nano electronics & Nano photonics',
      'Solar Photovoltics',
    ],
  },
  {
    id: 'embedded-iot',
    name: 'Embedded Systems & IoT',
    description: 'Microcontrollers, sensor networks, and connected smart hardware',
    color: {
      bg: 'bg-amber-50/60',
      border: 'border-amber-200',
      text: 'text-amber-900',
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    domains: [
      'Microprocessor and Microcontroller',
      'Embedded System',
      'IOT',
      'Wireless Sensor Networks',
    ],
  },
  {
    id: 'ai-computing',
    name: 'Computing, AI & Signal Processing',
    description: 'Artificial intelligence, machine learning, computer vision, and programming',
    color: {
      bg: 'bg-indigo-50/60',
      border: 'border-indigo-200',
      text: 'text-indigo-900',
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    },
    domains: [
      'AI and ML',
      'Machine Intelligence',
      'Digital Image Processing',
      'Python',
      'C and C++',
    ],
  },
];

// Flat list of all 32 valid domains
export const ALL_ECE_DOMAINS: string[] = ECE_DOMAIN_CATEGORIES.flatMap((c) => c.domains);

// Quick lookup set for validation
export const ECE_DOMAINS_SET = new Set<string>(ALL_ECE_DOMAINS);

export function isValidDomain(domain: string): boolean {
  return ECE_DOMAINS_SET.has(domain);
}
