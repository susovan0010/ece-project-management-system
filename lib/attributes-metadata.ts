// ========================================================
// ECE Capstone Project Management System - Attribute & SDG Metadata
// Zero-dependency canonical dictionary for Washington Accord (WP, WK, EA)
// and UN Sustainable Development Goals (SDGs 1..17).
// Safe for both Server Actions and Client Components.
// ========================================================

export interface AttributeMetadataItem {
  code: string;
  kind: 'WP' | 'WK' | 'EA';
  title: string;
  statement: string;
}

export const ATTRIBUTE_METADATA: Record<string, AttributeMetadataItem> = {
  // Complex Problem Solving (WP1..WP7)
  WP1: {
    code: 'WP1',
    kind: 'WP',
    title: 'Depth of Knowledge Required',
    statement: 'Cannot be resolved without in-depth engineering knowledge at the level of one or more of WK3, WK4, WK5, WK6 or WK8.',
  },
  WP2: {
    code: 'WP2',
    kind: 'WP',
    title: 'Range of Conflicting Issues',
    statement: 'Involve wide-ranging or conflicting technical, engineering and other issues.',
  },
  WP3: {
    code: 'WP3',
    kind: 'WP',
    title: 'Depth of Analysis Required',
    statement: 'Have no obvious solution and require abstract thinking, originality in analysis to formulate suitable models.',
  },
  WP4: {
    code: 'WP4',
    kind: 'WP',
    title: 'Familiarity of Issues',
    statement: 'Involve infrequently encountered issues.',
  },
  WP5: {
    code: 'WP5',
    kind: 'WP',
    title: 'Extent of Applicable Codes',
    statement: 'Are outside problems encompassed by standards and codes of practice for professional engineering.',
  },
  WP6: {
    code: 'WP6',
    kind: 'WP',
    title: 'Stakeholder Involvement',
    statement: 'Involve diverse groups of stakeholders with widely varying needs.',
  },
  WP7: {
    code: 'WP7',
    kind: 'WP',
    title: 'Interdependence',
    statement: 'Are high-level problems including many component parts or sub-problems.',
  },

  // Engineering Knowledge (WK1..WK9)
  WK1: {
    code: 'WK1',
    kind: 'WK',
    title: 'Natural Sciences',
    statement: 'A systematic, theory-based understanding of the natural sciences applicable to the discipline.',
  },
  WK2: {
    code: 'WK2',
    kind: 'WK',
    title: 'Mathematics & Computing',
    statement: 'Conceptually-based mathematics, numerical analysis, statistics and formal aspects of computer and information science.',
  },
  WK3: {
    code: 'WK3',
    kind: 'WK',
    title: 'Discipline Fundamentals',
    statement: 'A systematically organized body of knowledge in electrical, electronics and communication engineering sciences.',
  },
  WK4: {
    code: 'WK4',
    kind: 'WK',
    title: 'Specialist Knowledge',
    statement: 'Engineering specialist knowledge that provides theoretical frameworks and bodies of knowledge for an accepted sub-discipline (e.g. communications, VLSI, signal processing, microwave, embedded systems).',
  },
  WK5: {
    code: 'WK5',
    kind: 'WK',
    title: 'Engineering Design Practice',
    statement: 'Knowledge of engineering design practice, methodologies, architectures, and synthesis.',
  },
  WK6: {
    code: 'WK6',
    kind: 'WK',
    title: 'Engineering Tools & Practice',
    statement: 'Knowledge of engineering practice (technology) in the discipline including standard tools, CAD packages, simulation, and testbenches.',
  },
  WK7: {
    code: 'WK7',
    kind: 'WK',
    title: 'Engineering in Society',
    statement: 'Comprehension of the role of engineering in society and identified issues in engineering practice: ethics, health, safety, environmental issues and sustainable development.',
  },
  WK8: {
    code: 'WK8',
    kind: 'WK',
    title: 'Research Literature',
    statement: 'Engagement with selected knowledge in the research literature of the discipline.',
  },
  WK9: {
    code: 'WK9',
    kind: 'WK',
    title: 'Professional & Ethical Context',
    statement: 'Understanding of the professional, commercial, legal, and ethical context in which engineering is practiced.',
  },

  // Complex Engineering Activities (EA1..EA5)
  EA1: {
    code: 'EA1',
    kind: 'EA',
    title: 'Range of Resources',
    statement: 'Involve the use of diverse resources including people, materials, equipment, numerical tools, and technologies.',
  },
  EA2: {
    code: 'EA2',
    kind: 'EA',
    title: 'Level of Interactions',
    statement: 'Require resolution of significant problems arising from interactions between wide-ranging or conflicting technical, engineering or other issues.',
  },
  EA3: {
    code: 'EA3',
    kind: 'EA',
    title: 'Innovation',
    statement: 'Involve creative use of engineering principles and research-based knowledge in novel ways.',
  },
  EA4: {
    code: 'EA4',
    kind: 'EA',
    title: 'Consequences to Society',
    statement: 'Have significant consequences in a range of contexts, characterized by serious problems respecting to one or more of the SDGs.',
  },
  EA5: {
    code: 'EA5',
    kind: 'EA',
    title: 'Familiarity of Solution',
    statement: 'Extend beyond previous experiences by applying engineering principles to develop novel solutions.',
  },
};

export interface SdgMetadataItem {
  id: number;
  title: string;
  description: string;
  targets: Array<{ id: string; description: string }>;
}

export const SDG_METADATA: SdgMetadataItem[] = [
  {
    id: 1,
    title: 'No Poverty',
    description: 'End poverty in all its forms everywhere.',
    targets: [{ id: '1.4', description: 'Ensure equal rights to economic resources and basic services.' }],
  },
  {
    id: 2,
    title: 'Zero Hunger',
    description: 'End hunger, achieve food security and improved nutrition.',
    targets: [{ id: '2.4', description: 'Ensure sustainable food production systems and resilient agricultural practices.' }],
  },
  {
    id: 3,
    title: 'Good Health and Well-Being',
    description: 'Ensure healthy lives and promote well-being for all at all ages.',
    targets: [{ id: '3.8', description: 'Achieve universal health coverage and access to safe effective diagnostics.' }],
  },
  {
    id: 4,
    title: 'Quality Education',
    description: 'Ensure inclusive and equitable quality education.',
    targets: [{ id: '4.4', description: 'Substantially increase technical and vocational skills for employment.' }],
  },
  {
    id: 5,
    title: 'Gender Equality',
    description: 'Achieve gender equality and empower all women and girls.',
    targets: [{ id: '5.b', description: 'Enhance the use of enabling technology, in particular ICT.' }],
  },
  {
    id: 6,
    title: 'Clean Water and Sanitation',
    description: 'Ensure availability and sustainable management of water.',
    targets: [{ id: '6.3', description: 'Improve water quality by reducing pollution and increasing recycling.' }],
  },
  {
    id: 7,
    title: 'Affordable and Clean Energy',
    description: 'Ensure access to affordable, reliable, sustainable and modern energy for all.',
    targets: [{ id: '7.2', description: 'Substantially increase the share of renewable energy in the global energy mix.' }],
  },
  {
    id: 8,
    title: 'Decent Work and Economic Growth',
    description: 'Promote sustained, inclusive and sustainable economic growth.',
    targets: [{ id: '8.2', description: 'Achieve higher levels of economic productivity through technological upgrading.' }],
  },
  {
    id: 9,
    title: 'Industry, Innovation and Infrastructure',
    description: 'Build resilient infrastructure, promote inclusive and sustainable industrialization.',
    targets: [
      { id: '9.5', description: 'Enhance scientific research and upgrade technological capabilities.' },
      { id: '9.b', description: 'Support domestic technology development and research innovation.' },
    ],
  },
  {
    id: 10,
    title: 'Reduced Inequalities',
    description: 'Reduce inequality within and among countries.',
    targets: [{ id: '10.2', description: 'Empower and promote the social, economic and political inclusion of all.' }],
  },
  {
    id: 11,
    title: 'Sustainable Cities and Communities',
    description: 'Make cities and human settlements inclusive, safe, resilient and sustainable.',
    targets: [{ id: '11.6', description: 'Reduce the adverse per capita environmental impact of cities including air quality.' }],
  },
  {
    id: 12,
    title: 'Responsible Consumption and Production',
    description: 'Ensure sustainable consumption and production patterns.',
    targets: [{ id: '12.5', description: 'Substantially reduce waste generation through prevention, reduction, recycling.' }],
  },
  {
    id: 13,
    title: 'Climate Action',
    description: 'Take urgent action to combat climate change and its impacts.',
    targets: [{ id: '13.3', description: 'Improve education and awareness on climate change mitigation and early warning.' }],
  },
  {
    id: 14,
    title: 'Life Below Water',
    description: 'Conserve and sustainably use the oceans, seas and marine resources.',
    targets: [{ id: '14.1', description: 'Prevent and significantly reduce marine pollution of all kinds.' }],
  },
  {
    id: 15,
    title: 'Life on Land',
    description: 'Protect, restore and promote sustainable use of terrestrial ecosystems.',
    targets: [{ id: '15.1', description: 'Ensure the conservation and sustainable use of terrestrial and inland freshwater ecosystems.' }],
  },
  {
    id: 16,
    title: 'Peace, Justice and Strong Institutions',
    description: 'Promote peaceful and inclusive societies for sustainable development.',
    targets: [{ id: '16.6', description: 'Develop effective, accountable and transparent institutions at all levels.' }],
  },
  {
    id: 17,
    title: 'Partnerships for the Goals',
    description: 'Strengthen the means of implementation and revitalize the global partnership.',
    targets: [{ id: '17.6', description: 'Enhance access to science, technology and innovation and enhance knowledge sharing.' }],
  },
];
