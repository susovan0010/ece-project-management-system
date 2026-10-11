// ========================================================
// ECE Capstone Project Management System - Catalogue & Rubrics Seed
// Heritage Institute of Technology, Kolkata (B.Tech ECE)
// ========================================================

import { PrismaClient, Kind, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PROGRAM_OUTCOMES,
  ATTRIBUTES,
  WK_PO_MAP,
  SDGS,
  RUBRICS,
} from './catalogue-data';

const prisma = new PrismaClient();

export async function seedDatabase() {
  console.log('========================================================');
  console.log('🌱 Starting HITK ECE Capstone Catalogue Seed (Phase 2)...');
  console.log('========================================================');

  // 1. Seed Initial Admin Account
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin.project@heritageit.edu';
  const adminName = process.env.INITIAL_ADMIN_NAME || 'Project Committee Admin';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'AdminPass@2026';
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: { name: adminName, role: Role.ADMIN, active: true },
    create: {
      email: adminEmail.toLowerCase(),
      name: adminName,
      passwordHash: adminHash,
      role: Role.ADMIN,
      active: true,
    },
  });
  console.log(`✓ Admin account verified: ${admin.email}`);

  // 2. Seed Default Settings
  await prisma.setting.upsert({
    where: { key: 'ATTAINMENT_TARGET' },
    update: { value: { target: 0.65, label: 'Department Standard (65%)' } },
    create: { key: 'ATTAINMENT_TARGET', value: { target: 0.65, label: 'Department Standard (65%)' } },
  });

  await prisma.setting.upsert({
    where: { key: 'MAX_PANEL_SLOTS' },
    update: { value: { slots: 3 } },
    create: { key: 'MAX_PANEL_SLOTS', value: { slots: 3 } },
  });
  console.log('✓ Department settings seeded (Attainment Target: 65%)');

  // 3. Seed Program Outcomes (11 POs)
  for (const po of PROGRAM_OUTCOMES) {
    await prisma.programOutcome.upsert({
      where: { code: po.code },
      update: { title: po.title, description: po.description },
      create: { code: po.code, title: po.title, description: po.description },
    });
  }
  console.log(`✓ Seeded ${PROGRAM_OUTCOMES.length} Program Outcomes (PO1–PO11)`);

  // 4. Seed Attributes (9 WK, 7 WP, 5 EA)
  for (const attr of ATTRIBUTES) {
    await prisma.attribute.upsert({
      where: { code: attr.code },
      update: { kind: attr.kind, title: attr.title, text: attr.text },
      create: { kind: attr.kind, code: attr.code, title: attr.title, text: attr.text },
    });
  }
  console.log(`✓ Seeded ${ATTRIBUTES.length} Washington Accord Attributes (9 WK, 7 WP, 5 EA)`);

  // 5. Seed WK-to-PO Map
  for (const mapping of WK_PO_MAP) {
    await prisma.wkPoMap.upsert({
      where: { wk_po: { wk: mapping.wk, po: mapping.po } },
      update: {},
      create: { wk: mapping.wk, po: mapping.po },
    });
  }
  console.log(`✓ Seeded ${WK_PO_MAP.length} WK-to-PO Map entries`);

  // 6. Seed 17 SDGs with Targets
  for (const sdg of SDGS) {
    await prisma.sdg.upsert({
      where: { id: sdg.id },
      update: { title: sdg.title, description: sdg.description },
      create: { id: sdg.id, title: sdg.title, description: sdg.description },
    });

    for (const target of sdg.targets) {
      await prisma.sdgTarget.upsert({
        where: { id: target.id },
        update: { sdgId: sdg.id, description: target.description },
        create: { id: target.id, sdgId: sdg.id, description: target.description },
      });
    }
  }
  console.log(`✓ Seeded 17 Sustainable Development Goals & Targets`);

  // 7. Seed Rubrics A to F, Criteria, and CriterionMaps
  let totalCriteriaCount = 0;
  let totalMapCount = 0;

  for (const r of RUBRICS) {
    await prisma.rubric.upsert({
      where: { code: r.code },
      update: { semester: r.semester, title: r.title, maxMarks: r.maxMarks },
      create: { code: r.code, semester: r.semester, title: r.title, maxMarks: r.maxMarks },
    });

    for (const c of r.criteria) {
      totalCriteriaCount++;
      const existingCriterion = await prisma.criterion.findFirst({
        where: { rubricCode: r.code, key: c.key },
      });

      const criterionRecord = existingCriterion
        ? await prisma.criterion.update({
            where: { id: existingCriterion.id },
            data: { label: c.label, maxMarks: c.maxMarks, scope: c.scope, semester: r.semester },
          })
        : await prisma.criterion.create({
            data: {
              rubricCode: r.code,
              semester: r.semester,
              key: c.key,
              label: c.label,
              maxMarks: c.maxMarks,
              scope: c.scope,
            },
          });

      for (const m of c.maps) {
        totalMapCount++;
        await prisma.criterionMap.upsert({
          where: { criterionId_kind_code: { criterionId: criterionRecord.id, kind: m.kind, code: m.code } },
          update: {},
          create: { criterionId: criterionRecord.id, kind: m.kind, code: m.code },
        });
      }
    }
  }
  console.log(`✓ Seeded Rubrics A through F (${totalCriteriaCount} criteria, ${totalMapCount} attribute maps)`);

  // --------------------------------------------------------
  // Verification Report (Brief Page 21 Checks)
  // --------------------------------------------------------
  console.log('\n========================================================');
  console.log('📊 PHASE 2 SEED VERIFICATION REPORT');
  console.log('========================================================');

  const poCount = await prisma.programOutcome.count();
  const wkCount = await prisma.attribute.count({ where: { kind: Kind.WK } });
  const wpCount = await prisma.attribute.count({ where: { kind: Kind.WP } });
  const eaCount = await prisma.attribute.count({ where: { kind: Kind.EA } });
  const sdgCount = await prisma.sdg.count();

  console.log(`Program Outcomes (Expected: 11):      ${poCount} ${poCount === 11 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Engineering Knowledge (Expected: 9):   ${wkCount} ${wkCount === 9 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Complex Problem Solving (Expected: 7): ${wpCount} ${wpCount === 7 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Engineering Activities (Expected: 5):  ${eaCount} ${eaCount === 5 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Sustainable Dev Goals (Expected: 17):  ${sdgCount} ${sdgCount === 17 ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\n--- Rubric Maxima Checks (Expected: A=60, B=40, C=50, D=50, E=40, F=60) ---');
  const rubricList = await prisma.rubric.findMany({
    include: { criteria: true },
    orderBy: { code: 'asc' },
  });

  const expectedMaxima: Record<string, number> = { A: 60, B: 40, C: 50, D: 50, E: 40, F: 60 };
  let allRubricsValid = true;

  for (const rubric of rubricList) {
    const sumCriteria = rubric.criteria.reduce((s, c) => s + c.maxMarks, 0);
    const expected = expectedMaxima[rubric.code];
    const match = sumCriteria === expected && rubric.maxMarks === expected;
    if (!match) allRubricsValid = false;

    console.log(
      `Rubric ${rubric.code} (Sem ${rubric.semester}): Max = ${rubric.maxMarks}, Sum of Criteria = ${sumCriteria} | Expected: ${expected} ${match ? '✓ PASS' : '✗ FAIL'}`
    );
  }

  console.log('========================================================');
  if (
    poCount === 11 &&
    wkCount === 9 &&
    wpCount === 7 &&
    eaCount === 5 &&
    sdgCount === 17 &&
    allRubricsValid
  ) {
    console.log('🎉 ALL CATALOGUE & RUBRIC INTEGRITY CHECKS PASSED PERFECTLY!');
  } else {
    console.error('⚠️ ONE OR MORE CATALOGUE INTEGRITY CHECKS FAILED.');
    process.exit(1);
  }
  console.log('========================================================\n');
}

// Execute when invoked directly
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.includes('seed'))) {
  seedDatabase()
    .catch((e) => {
      console.error('Error in seed execution:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
