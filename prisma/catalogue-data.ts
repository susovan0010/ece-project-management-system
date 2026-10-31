// ========================================================
// ECE Capstone Project Management System - Catalogue & Rubric Data
// Heritage Institute of Technology, Kolkata (B.Tech ECE)
// ========================================================

import { Kind, Scope } from '@prisma/client';

// --------------------------------------------------------
// 1. Program Outcomes (11 POs)
// --------------------------------------------------------
export const PROGRAM_OUTCOMES = [
  { code: 'PO1', title: 'Engineering Knowledge', description: 'Apply knowledge of mathematics, science, engineering fundamentals, and electronics & communication engineering specialization to solve complex engineering problems.' },
  { code: 'PO2', title: 'Problem Analysis', description: 'Identify, formulate, research literature, and analyze complex engineering problems reaching substantiated conclusions using first principles of mathematics, natural sciences, and engineering sciences.' },
  { code: 'PO3', title: 'Design/Development of Solutions', description: 'Design solutions for complex engineering problems and design system components or processes that meet specified needs with appropriate consideration for public health and safety, cultural, societal, and environmental considerations.' },
  { code: 'PO4', title: 'Conduct Investigations of Complex Problems', description: 'Use research-based knowledge and research methods including design of experiments, analysis and interpretation of data, and synthesis of information to provide valid conclusions.' },
  { code: 'PO5', title: 'Modern Tool Usage', description: 'Create, select, and apply appropriate techniques, resources, and modern engineering and IT tools including prediction and modeling to complex engineering activities with an understanding of the limitations.' },
  { code: 'PO6', title: 'The Engineer and Society', description: 'Apply reasoning informed by contextual knowledge to assess societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to professional engineering practice.' },
  { code: 'PO7', title: 'Environment and Sustainability', description: 'Understand the impact of professional engineering solutions in societal and environmental contexts, and demonstrate the knowledge of, and need for sustainable development.' },
  { code: 'PO8', title: 'Ethics', description: 'Apply ethical principles and commit to professional ethics and responsibilities and norms of the engineering practice.' },
  { code: 'PO9', title: 'Individual and Team Work', description: 'Function effectively as an individual, and as a member or leader in diverse teams, and in multidisciplinary settings.' },
  { code: 'PO10', title: 'Communication', description: 'Communicate effectively on complex engineering activities with the engineering community and with society at large, such as being able to comprehend and write effective reports and design documentation, make effective presentations, and give and receive clear instructions.' },
  { code: 'PO11', title: 'Project Management and Finance', description: 'Demonstrate knowledge and understanding of engineering and management principles and apply these to one’s own work, as a member and leader in a team, to manage projects and in multidisciplinary environments.' },
];

// --------------------------------------------------------
// 2. Washington Accord Attributes (WP1..WP7, WK1..WK9, EA1..EA5)
// --------------------------------------------------------
export const ATTRIBUTES = [
  // Engineering Knowledge (WK1..WK9)
  { kind: Kind.WK, code: 'WK1', title: 'Natural Sciences', text: 'A systematic, theory-based understanding of the natural sciences applicable to the discipline.' },
  { kind: Kind.WK, code: 'WK2', title: 'Mathematics & Computing', text: 'Conceptually-based mathematics, numerical analysis, statistics and formal aspects of computer and information science.' },
  { kind: Kind.WK, code: 'WK3', title: 'Discipline Fundamentals', text: 'A systematically organized body of knowledge in electrical, electronics and communication engineering sciences.' },
  { kind: Kind.WK, code: 'WK4', title: 'Specialist Knowledge', text: 'Engineering specialist knowledge that provides theoretical frameworks and bodies of knowledge for an accepted sub-discipline (e.g. communications, VLSI, signal processing, microwave, embedded systems).' },
  { kind: Kind.WK, code: 'WK5', title: 'Engineering Design Practice', text: 'Knowledge of engineering design practice, methodologies, architectures, and synthesis.' },
  { kind: Kind.WK, code: 'WK6', title: 'Engineering Tools & Practice', text: 'Knowledge of engineering practice (technology) in the discipline including standard tools, CAD packages, simulation, and testbenches.' },
  { kind: Kind.WK, code: 'WK7', title: 'Engineering in Society', text: 'Comprehension of the role of engineering in society and identified issues in engineering practice: ethics, health, safety, environmental issues and sustainable development.' },
  { kind: Kind.WK, code: 'WK8', title: 'Research Literature', text: 'Engagement with selected knowledge in the research literature of the discipline.' },
  { kind: Kind.WK, code: 'WK9', title: 'Professional & Ethical Context', text: 'Understanding of the professional, commercial, legal, and ethical context in which engineering is practiced.' },

  // Complex Problem Solving (WP1..WP7)
  { kind: Kind.WP, code: 'WP1', title: 'Depth of Knowledge Required', text: 'Cannot be resolved without in-depth engineering knowledge at the level of one or more of WK3, WK4, WK5, WK6 or WK8.' },
  { kind: Kind.WP, code: 'WP2', title: 'Range of Conflicting Issues', text: 'Involve wide-ranging or conflicting technical, engineering and other issues.' },
  { kind: Kind.WP, code: 'WP3', title: 'Depth of Analysis Required', text: 'Have no obvious solution and require abstract thinking, originality in analysis to formulate suitable models.' },
  { kind: Kind.WP, code: 'WP4', title: 'Familiarity of Issues', text: 'Involve infrequently encountered issues.' },
  { kind: Kind.WP, code: 'WP5', title: 'Extent of Applicable Codes', text: 'Are outside problems encompassed by standards and codes of practice for professional engineering.' },
  { kind: Kind.WP, code: 'WP6', title: 'Stakeholder Involvement', text: 'Involve diverse groups of stakeholders with widely varying needs.' },
  { kind: Kind.WP, code: 'WP7', title: 'Interdependence', text: 'Are high-level problems including many component parts or sub-problems.' },

  // Complex Engineering Activities (EA1..EA5)
  { kind: Kind.EA, code: 'EA1', title: 'Range of Resources', text: 'Involve the use of diverse resources including people, materials, equipment, numerical tools, and technologies.' },
  { kind: Kind.EA, code: 'EA2', title: 'Level of Interactions', text: 'Require resolution of significant problems arising from interactions between wide-ranging or conflicting technical, engineering or other issues.' },
  { kind: Kind.EA, code: 'EA3', title: 'Innovation', text: 'Involve creative use of engineering principles and research-based knowledge in novel ways.' },
  { kind: Kind.EA, code: 'EA4', title: 'Consequences to Society', text: 'Have significant consequences in a range of contexts, characterized by serious problems respecting to one or more of the SDGs.' },
  { kind: Kind.EA, code: 'EA5', title: 'Familiarity of Solution', text: 'Extend beyond previous experiences by applying engineering principles to develop novel solutions.' },
];

// --------------------------------------------------------
// 3. Department WK-to-PO Map
// --------------------------------------------------------
export const WK_PO_MAP = [
  { po: 'PO1', wk: 'WK1' },
  { po: 'PO1', wk: 'WK2' },
  { po: 'PO1', wk: 'WK3' },
  { po: 'PO1', wk: 'WK4' },

  { po: 'PO2', wk: 'WK1' },
  { po: 'PO2', wk: 'WK2' },
  { po: 'PO2', wk: 'WK3' },
  { po: 'PO2', wk: 'WK4' },

  { po: 'PO3', wk: 'WK5' },

  { po: 'PO4', wk: 'WK8' },

  { po: 'PO5', wk: 'WK2' },
  { po: 'PO5', wk: 'WK6' },

  { po: 'PO6', wk: 'WK1' },
  { po: 'PO6', wk: 'WK5' },
  { po: 'PO6', wk: 'WK7' },

  { po: 'PO7', wk: 'WK9' },

  // PO8, PO9, PO10 have no WK link -> assessed by rubric
  { po: 'PO11', wk: 'WK8' },
];

// --------------------------------------------------------
// 4. UN Sustainable Development Goals (17 SDGs) & Targets
// --------------------------------------------------------
export const SDGS = [
  { id: 1, title: 'No Poverty', description: 'End poverty in all its forms everywhere.', targets: [{ id: '1.4', description: 'Ensure equal rights to economic resources and basic services.' }] },
  { id: 2, title: 'Zero Hunger', description: 'End hunger, achieve food security and improved nutrition.', targets: [{ id: '2.4', description: 'Ensure sustainable food production systems and resilient agricultural practices.' }] },
  { id: 3, title: 'Good Health and Well-Being', description: 'Ensure healthy lives and promote well-being for all at all ages.', targets: [{ id: '3.8', description: 'Achieve universal health coverage and access to safe effective diagnostics.' }] },
  { id: 4, title: 'Quality Education', description: 'Ensure inclusive and equitable quality education.', targets: [{ id: '4.4', description: 'Substantially increase technical and vocational skills for employment.' }] },
  { id: 5, title: 'Gender Equality', description: 'Achieve gender equality and empower all women and girls.', targets: [{ id: '5.b', description: 'Enhance the use of enabling technology, in particular ICT.' }] },
  { id: 6, title: 'Clean Water and Sanitation', description: 'Ensure availability and sustainable management of water.', targets: [{ id: '6.3', description: 'Improve water quality by reducing pollution and increasing recycling.' }] },
  { id: 7, title: 'Affordable and Clean Energy', description: 'Ensure access to affordable, reliable, sustainable and modern energy for all.', targets: [{ id: '7.2', description: 'Substantially increase the share of renewable energy in the global energy mix.' }] },
  { id: 8, title: 'Decent Work and Economic Growth', description: 'Promote sustained, inclusive and sustainable economic growth.', targets: [{ id: '8.2', description: 'Achieve higher levels of economic productivity through technological upgrading.' }] },
  { id: 9, title: 'Industry, Innovation and Infrastructure', description: 'Build resilient infrastructure, promote inclusive and sustainable industrialization.', targets: [{ id: '9.5', description: 'Enhance scientific research and upgrade technological capabilities.' }, { id: '9.b', description: 'Support domestic technology development and research innovation.' }] },
  { id: 10, title: 'Reduced Inequalities', description: 'Reduce inequality within and among countries.', targets: [{ id: '10.2', description: 'Empower and promote the social, economic and political inclusion of all.' }] },
  { id: 11, title: 'Sustainable Cities and Communities', description: 'Make cities and human settlements inclusive, safe, resilient and sustainable.', targets: [{ id: '11.6', description: 'Reduce the adverse per capita environmental impact of cities including air quality.' }] },
  { id: 12, title: 'Responsible Consumption and Production', description: 'Ensure sustainable consumption and production patterns.', targets: [{ id: '12.5', description: 'Substantially reduce waste generation through prevention, reduction, recycling.' }] },
  { id: 13, title: 'Climate Action', description: 'Take urgent action to combat climate change and its impacts.', targets: [{ id: '13.3', description: 'Improve education and awareness on climate change mitigation and early warning.' }] },
  { id: 14, title: 'Life Below Water', description: 'Conserve and sustainably use the oceans, seas and marine resources.', targets: [{ id: '14.1', description: 'Prevent and significantly reduce marine pollution of all kinds.' }] },
  { id: 15, title: 'Life on Land', description: 'Protect, restore and promote sustainable use of terrestrial ecosystems.', targets: [{ id: '15.1', description: 'Ensure the conservation and sustainable use of terrestrial and inland freshwater ecosystems.' }] },
  { id: 16, title: 'Peace, Justice and Strong Institutions', description: 'Promote peaceful and inclusive societies for sustainable development.', targets: [{ id: '16.6', description: 'Develop effective, accountable and transparent institutions at all levels.' }] },
  { id: 17, title: 'Partnerships for the Goals', description: 'Strengthen the means of implementation and revitalize the global partnership.', targets: [{ id: '17.6', description: 'Enhance access to science, technology and innovation and enhance knowledge sharing.' }] },
];

// --------------------------------------------------------
// 5. Rubrics A through F with Criteria & Maxima
// Maxima: A=60, B=40, C=50, D=50, E=40, F=60
// --------------------------------------------------------
export const RUBRICS = [
  {
    code: 'A',
    semester: 6,
    title: "6th Semester – Supervisor's Evaluation Sheet (Rubric A)",
    maxMarks: 60,
    criteria: [
      {
        key: 'regularity',
        label: 'Regularity',
        maxMarks: 12,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'PO', code: 'PO10' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'task_completion',
        label: 'Task Completion',
        maxMarks: 12,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'EA', code: 'EA1' },
          { kind: 'PO', code: 'PO9' }, { kind: 'PO', code: 'PO10' },
        ],
      },
      {
        key: 'lit_survey',
        label: 'Literature Survey',
        maxMarks: 12,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'WP', code: 'WP4' },
          { kind: 'WK', code: 'WK1' }, { kind: 'WK', code: 'WK8' },
          { kind: 'EA', code: 'EA5' },
          { kind: 'PO', code: 'PO2' }, { kind: 'PO', code: 'PO4' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'behaviour',
        label: 'Behaviour',
        maxMarks: 12,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WK', code: 'WK7' }, { kind: 'WK', code: 'WK9' },
          { kind: 'PO', code: 'PO7' }, { kind: 'PO', code: 'PO8' },
        ],
      },
      {
        key: 'involvement',
        label: 'Involvement',
        maxMarks: 12,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WK', code: 'WK9' }, { kind: 'EA', code: 'EA1' },
          { kind: 'PO', code: 'PO8' }, { kind: 'PO', code: 'PO11' },
        ],
      },
    ],
  },
  {
    code: 'B',
    semester: 6,
    title: "6th Semester – Co-examiner's Evaluation Sheet (Rubric B)",
    maxMarks: 40,
    criteria: [
      {
        key: 'presentation',
        label: 'Presentation',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'PO', code: 'PO9' },
        ],
      },
      {
        key: 'knowledge_own_work',
        label: 'Knowledge of Work',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'WP', code: 'WP3' },
          { kind: 'WK', code: 'WK3' }, { kind: 'WK', code: 'WK4' },
          { kind: 'PO', code: 'PO1' }, { kind: 'PO', code: 'PO2' },
        ],
      },
      {
        key: 'lit_survey',
        label: 'Literature Survey',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'WP', code: 'WP4' },
          { kind: 'WK', code: 'WK1' }, { kind: 'WK', code: 'WK8' },
          { kind: 'EA', code: 'EA5' },
          { kind: 'PO', code: 'PO2' }, { kind: 'PO', code: 'PO4' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'viva_voce',
        label: 'Viva Voce',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'WP', code: 'WP3' },
          { kind: 'WK', code: 'WK3' }, { kind: 'WK', code: 'WK4' }, { kind: 'WK', code: 'WK6' },
          { kind: 'PO', code: 'PO1' }, { kind: 'PO', code: 'PO9' },
        ],
      },
    ],
  },
  {
    code: 'C',
    semester: 7,
    title: '7th Semester – Supervisor’s Evaluation Sheet',
    maxMarks: 50,
    criteria: [
      {
        key: 'regularity',
        label: 'Regularity',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'PO', code: 'PO10' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'task_completion',
        label: 'Task Completion',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'EA', code: 'EA1' },
          { kind: 'PO', code: 'PO10' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'teamwork',
        label: 'Leadership',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WK', code: 'WK9' },
          { kind: 'EA', code: 'EA1' },
          { kind: 'PO', code: 'PO8' }, { kind: 'PO', code: 'PO10' },
        ],
      },
      {
        key: 'behaviour',
        label: 'Behaviour',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WK', code: 'WK7' }, { kind: 'WK', code: 'WK9' },
          { kind: 'PO', code: 'PO7' }, { kind: 'PO', code: 'PO8' },
        ],
      },
      {
        key: 'involvement',
        label: 'Involvement',
        maxMarks: 10,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WK', code: 'WK9' },
          { kind: 'EA', code: 'EA1' },
          { kind: 'PO', code: 'PO8' }, { kind: 'PO', code: 'PO10' }, { kind: 'PO', code: 'PO11' },
        ],
      },
    ],
  },
  {
    code: 'D',
    semester: 7,
    title: '7th Semester – Panellist’s Evaluation Sheet',
    maxMarks: 50,
    criteria: [
      {
        key: 'novelty',
        label: 'Novelty',
        maxMarks: 7,
        scope: Scope.GROUP,
        maps: [
          { kind: 'WP', code: 'WP3' }, { kind: 'WP', code: 'WP4' },
          { kind: 'WK', code: 'WK8' },
          { kind: 'EA', code: 'EA3' }, { kind: 'EA', code: 'EA5' },
          { kind: 'PO', code: 'PO3' }, { kind: 'PO', code: 'PO4' },
        ],
      },
      {
        key: 'realistic_problem',
        label: 'Realistic Problem',
        maxMarks: 7,
        scope: Scope.GROUP,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'WP', code: 'WP2' },
          { kind: 'WK', code: 'WK5' }, { kind: 'WK', code: 'WK7' },
          { kind: 'EA', code: 'EA2' },
          { kind: 'PO', code: 'PO2' }, { kind: 'PO', code: 'PO3' }, { kind: 'PO', code: 'PO6' },
        ],
      },
      {
        key: 'impact_society',
        label: 'Societal Impact',
        maxMarks: 3,
        scope: Scope.GROUP,
        maps: [
          { kind: 'WP', code: 'WP6' },
          { kind: 'WK', code: 'WK7' },
          { kind: 'EA', code: 'EA4' },
          { kind: 'PO', code: 'PO6' },
        ],
      },
      {
        key: 'publication',
        label: 'Publication',
        maxMarks: 3,
        scope: Scope.GROUP,
        maps: [
          { kind: 'WK', code: 'WK8' },
          { kind: 'EA', code: 'EA3' },
          { kind: 'PO', code: 'PO4' }, { kind: 'PO', code: 'PO9' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'presentation',
        label: 'Presentation',
        maxMarks: 15,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'PO', code: 'PO9' },
        ],
      },
      {
        key: 'viva_voce',
        label: 'Viva Voce',
        maxMarks: 15,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'WP', code: 'WP3' },
          { kind: 'WK', code: 'WK3' }, { kind: 'WK', code: 'WK4' }, { kind: 'WK', code: 'WK6' },
          { kind: 'PO', code: 'PO1' }, { kind: 'PO', code: 'PO9' },
        ],
      },
    ],
  },
  {
    code: 'E',
    semester: 8,
    title: '8th Semester – Supervisor’s Evaluation Sheet',
    maxMarks: 40,
    criteria: [
      {
        key: 'regularity',
        label: 'Regularity',
        maxMarks: 8,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'PO', code: 'PO10' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'task_completion',
        label: 'Task Completion',
        maxMarks: 8,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'EA', code: 'EA1' },
          { kind: 'PO', code: 'PO10' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'teamwork',
        label: 'Leadership',
        maxMarks: 8,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WK', code: 'WK9' },
          { kind: 'EA', code: 'EA1' },
          { kind: 'PO', code: 'PO8' }, { kind: 'PO', code: 'PO10' },
        ],
      },
      {
        key: 'behaviour',
        label: 'Behaviour',
        maxMarks: 8,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WK', code: 'WK7' }, { kind: 'WK', code: 'WK9' },
          { kind: 'PO', code: 'PO7' }, { kind: 'PO', code: 'PO8' },
        ],
      },
      {
        key: 'involvement',
        label: 'Involvement',
        maxMarks: 8,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WK', code: 'WK9' },
          { kind: 'EA', code: 'EA1' },
          { kind: 'PO', code: 'PO8' }, { kind: 'PO', code: 'PO10' }, { kind: 'PO', code: 'PO11' },
        ],
      },
    ],
  },
  {
    code: 'F',
    semester: 8,
    title: '8th Semester – External Examiner’s Evaluation Sheet',
    maxMarks: 60,
    criteria: [
      {
        key: 'novelty',
        label: 'Novelty',
        maxMarks: 8,
        scope: Scope.GROUP,
        maps: [
          { kind: 'WP', code: 'WP3' }, { kind: 'WP', code: 'WP4' },
          { kind: 'WK', code: 'WK8' },
          { kind: 'EA', code: 'EA3' }, { kind: 'EA', code: 'EA5' },
          { kind: 'PO', code: 'PO3' }, { kind: 'PO', code: 'PO4' },
        ],
      },
      {
        key: 'realistic_problem',
        label: 'Realistic Problem',
        maxMarks: 8,
        scope: Scope.GROUP,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'WP', code: 'WP2' },
          { kind: 'WK', code: 'WK5' }, { kind: 'WK', code: 'WK7' },
          { kind: 'EA', code: 'EA2' },
          { kind: 'PO', code: 'PO2' }, { kind: 'PO', code: 'PO3' }, { kind: 'PO', code: 'PO6' },
        ],
      },
      {
        key: 'impact_society',
        label: 'Societal Impact',
        maxMarks: 3,
        scope: Scope.GROUP,
        maps: [
          { kind: 'WP', code: 'WP6' },
          { kind: 'WK', code: 'WK7' },
          { kind: 'EA', code: 'EA4' },
          { kind: 'PO', code: 'PO6' },
        ],
      },
      {
        key: 'publication',
        label: 'Publication',
        maxMarks: 5,
        scope: Scope.GROUP,
        maps: [
          { kind: 'WK', code: 'WK8' },
          { kind: 'EA', code: 'EA3' },
          { kind: 'PO', code: 'PO4' }, { kind: 'PO', code: 'PO9' }, { kind: 'PO', code: 'PO11' },
        ],
      },
      {
        key: 'presentation',
        label: 'Presentation',
        maxMarks: 18,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'PO', code: 'PO9' },
        ],
      },
      {
        key: 'viva_voce',
        label: 'Viva Voce',
        maxMarks: 18,
        scope: Scope.STUDENT,
        maps: [
          { kind: 'WP', code: 'WP1' }, { kind: 'WP', code: 'WP3' },
          { kind: 'WK', code: 'WK3' }, { kind: 'WK', code: 'WK4' }, { kind: 'WK', code: 'WK6' },
          { kind: 'PO', code: 'PO1' }, { kind: 'PO', code: 'PO9' },
        ],
      },
    ],
  },
];
