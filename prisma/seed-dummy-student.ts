import { PrismaClient, TopicStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seedDummyStudent() {
  console.log('Seeding dummy student and project allocation for development...');

  // 1. Ensure Batch exists
  const batchId = '2023-2027';
  const batch = await prisma.batch.upsert({
    where: { id: batchId },
    update: { active: true },
    create: { id: batchId, active: true },
  });

  // 2. Find an active supervisor (prefer Debasish or first active faculty)
  let supervisor = await prisma.user.findFirst({
    where: {
      active: true,
      role: { in: ['FACULTY', 'ADMIN'] },
      email: { contains: 'debasish' },
    },
  });

  if (!supervisor) {
    supervisor = await prisma.user.findFirst({
      where: { active: true, role: { in: ['FACULTY', 'ADMIN'] } },
    });
  }

  if (!supervisor) {
    throw new Error('No active faculty or admin found in database to assign as supervisor.');
  }

  // 3. Find a confirmed or available topic
  let topic = await prisma.topic.findFirst({
    where: { status: { in: [TopicStatus.CONFIRMED, TopicStatus.DRAFT, TopicStatus.ALLOTTED] } },
    include: { sdgs: true, attributes: true },
  });

  if (!topic) {
    topic = await prisma.topic.create({
      data: {
        code: 'FAC-2026-DEMO',
        title: 'IoT and Deep Learning-Based Smart Agricultural Monitoring System',
        source: 'FACULTY',
        category: 'Both',
        domain: 'IOT, Embedded System, AI and ML',
        description:
          'Design and implementation of an energy-efficient wireless sensor network (WSN) with edge-AI anomaly detection for precision crop health, soil moisture, and microclimate regulation in automated greenhouse environments.',
        status: TopicStatus.ALLOTTED,
        proposerId: supervisor.id,
      },
      include: { sdgs: true, attributes: true },
    });
  } else {
    // Update status to ALLOTTED
    await prisma.topic.update({
      where: { id: topic.id },
      data: { status: TopicStatus.ALLOTTED },
    });
  }

  // 4. Create or Upsert Group 1
  const group = await prisma.group.upsert({
    where: {
      batchId_number: {
        batchId,
        number: 1,
      },
    },
    update: {
      topicId: topic.id,
      supervisorId: supervisor.id,
    },
    create: {
      batchId,
      number: 1,
      topicId: topic.id,
      supervisorId: supervisor.id,
    },
  });

  // 5. Create or Upsert Dummy Student User Account
  const studentEmail = 'student.demo@heritageit.edu';
  const studentPassword = 'student123';
  const passwordHash = await bcrypt.hash(studentPassword, 10);

  const studentUser = await prisma.user.upsert({
    where: { email: studentEmail },
    update: {
      name: 'Sourav Roy',
      passwordHash,
      role: 'STUDENT',
      active: true,
      mustChangePassword: false,
    },
    create: {
      email: studentEmail,
      name: 'Sourav Roy',
      passwordHash,
      role: 'STUDENT',
      active: true,
      mustChangePassword: false,
    },
  });

  // 6. Create or Upsert Students
  const dummyStudents = [
    {
      name: 'Sourav Roy',
      roll: '12620003001',
      email: studentEmail,
      phone: '+91 98765 43210',
      userId: studentUser.id,
    },
    {
      name: 'Ananya Sen',
      roll: '12620003002',
      email: 'ananya.sen@heritageit.edu',
      phone: '+91 98765 43211',
      userId: null,
    },
    {
      name: 'Rahul Mukherjee',
      roll: '12620003003',
      email: 'rahul.mukherjee@heritageit.edu',
      phone: '+91 98765 43212',
      userId: null,
    },
    {
      name: 'Priyanka Das',
      roll: '12620003004',
      email: 'priyanka.das@heritageit.edu',
      phone: '+91 98765 43213',
      userId: null,
    },
  ];

  for (const ds of dummyStudents) {
    const student = await prisma.student.upsert({
      where: { roll: ds.roll },
      update: {
        name: ds.name,
        email: ds.email,
        phone: ds.phone,
        userId: ds.userId,
      },
      create: {
        roll: ds.roll,
        name: ds.name,
        email: ds.email,
        phone: ds.phone,
        userId: ds.userId,
      },
    });

    // Link Student to Group
    await prisma.groupMember.upsert({
      where: {
        groupId_studentId: {
          groupId: group.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        groupId: group.id,
        studentId: student.id,
      },
    });
  }

  console.log('✅ Dummy student seeded successfully!');
  console.log(`   Student Name: Sourav Roy`);
  console.log(`   Roll Number:  12620003001`);
  console.log(`   Email:        ${studentEmail}`);
  console.log(`   Password:     ${studentPassword}`);
  console.log(`   Batch:        ${batchId}, Group #${group.number}`);
  console.log(`   Supervisor:   ${supervisor.name} (${supervisor.email})`);
  console.log(`   Project:      ${topic.title} (${topic.code})`);
}

if (require.main === module) {
  seedDummyStudent()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
