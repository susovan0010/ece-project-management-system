'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { doesAuthorListMatchName } from '@/lib/publications';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ProductSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, 'Product title is required.'),
  description: z.string().min(5, 'Product description is required.'),
  category: z.string().min(2).default('Hardware Prototype'),
  trlLevel: z.number().int().min(1).max(9).default(4),
  demoUrl: z.string().max(400).optional(),
  patentStatus: z.string().max(150).optional(),
  groupId: z.string().optional(),
  batchId: z.string().optional(),
  supervisorName: z.string().max(150).optional(),
  studentNames: z.string().max(500).optional(),
  featured: z.boolean().default(false),
});

const IndustrySchema = z.object({
  id: z.string().optional(),
  companyName: z.string().min(2, 'Company / Organization name is required.'),
  collaborationType: z.string().min(2).default('Sponsored Project'),
  projectTitle: z.string().min(2, 'Project / MoU title is required.'),
  description: z.string().max(2000).optional(),
  contactPerson: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED']).default('ACTIVE'),
  startYear: z.number().int().min(2000).max(2100),
  groupId: z.string().optional(),
  supervisorName: z.string().max(150).optional(),
});

// ----------------------------------------------------
// 1. Admin / Showcase: Publications Ledger (Project, Group, Students, Supervisor, Publication)
// ----------------------------------------------------
export async function getAdminShowcasePublicationsAction() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Admin access required.' };
  }

  try {
    const [publications, groups, facultyAndAdmins, topics] = await Promise.all([
      prisma.publication.findMany({
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.group.findMany({
        include: {
          topic: { select: { code: true, title: true } },
          supervisor: { select: { id: true, name: true, email: true } },
          members: {
            include: {
              student: { select: { name: true, roll: true, universityRoll: true } },
            },
          },
        },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      }),
      prisma.user.findMany({
        where: { role: { in: ['FACULTY', 'ADMIN'] } },
        select: { id: true, name: true, email: true },
      }),
      prisma.topic?.findMany
        ? prisma.topic.findMany({ select: { id: true, code: true, title: true } })
        : Promise.resolve([]),
    ]);

    const userById = new Map(facultyAndAdmins.map((u) => [u.id, u]));
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const topicById = new Map(topics.map((t) => [t.id, t]));

    const rows = publications.map((pub) => {
      let linkedGroup = pub.groupId ? groupById.get(pub.groupId) || null : null;
      const taggedTopic = pub.topicId ? topicById.get(pub.topicId) || null : null;

      if (!linkedGroup) {
        // Auto-match group via owner or student co-author names
        linkedGroup =
          groups.find(
            (g) =>
              g.supervisorId === pub.ownerUserId &&
              g.members.some((m) => doesAuthorListMatchName(pub.authors, m.student.name))
          ) ||
          groups.find((g) =>
            g.members.some((m) => doesAuthorListMatchName(pub.authors, m.student.name))
          ) ||
          null;
      }

      const ownerUser = userById.get(pub.ownerUserId) || null;
      const matchedFaculty =
        linkedGroup?.supervisor ||
        ownerUser ||
        facultyAndAdmins.find((f) => doesAuthorListMatchName(pub.authors, f.name)) ||
        null;

      const studentMembers = linkedGroup
        ? linkedGroup.members.map((m) => ({
            name: m.student.name,
            roll: m.student.roll,
            universityRoll: m.student.universityRoll || null,
          }))
        : [];

      return {
        id: pub.id,
        title: pub.title,
        authors: pub.authors,
        venue: pub.venue,
        year: pub.year,
        pubType: pub.pubType,
        doiUrl: pub.doiUrl,
        citationsCount: pub.citationsCount,
        source: pub.source,
        groupNumber: linkedGroup?.number ?? null,
        batchId: linkedGroup?.batchId ?? null,
        topicCode: taggedTopic?.code ?? linkedGroup?.topic?.code ?? null,
        topicTitle: taggedTopic?.title ?? linkedGroup?.topic?.title ?? null,
        supervisorName: matchedFaculty?.name || 'Unassigned / External',
        supervisorEmail: matchedFaculty?.email || null,
        studentMembers,
      };
    });

    return { success: true, publications: rows };
  } catch (err) {
    return { error: `Failed to load Showcase Publications: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. Admin / Showcase: Products CRUD
// ----------------------------------------------------
export async function getShowcaseProductsAction() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Admin access required.' };
  }

  try {
    const [products, groups, topics] = await Promise.all([
      prisma.showcaseProduct.findMany({
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.group.findMany({
        include: {
          topic: { select: { code: true, title: true } },
          supervisor: { select: { name: true } },
          members: { include: { student: { select: { name: true, roll: true } } } },
        },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      }),
      prisma.topic?.findMany
        ? prisma.topic.findMany({ select: { id: true, code: true, title: true } })
        : Promise.resolve([]),
    ]);

    const topicById = new Map(topics.map((t) => [t.id, t]));

    return {
      success: true,
      products: products.map((p) => ({
        ...p,
        taggedTopics: (p.taggedTopicIds || [])
          .map((tid) => topicById.get(tid))
          .filter((t): t is NonNullable<typeof t> => Boolean(t)),
        createdAt: p.createdAt.toISOString(),
      })),
      groups: groups.map((g) => ({
        id: g.id,
        number: g.number,
        batchId: g.batchId,
        topicCode: g.topic?.code || 'N/A',
        topicTitle: g.topic?.title || `Group ${g.number}`,
        supervisorName: g.supervisor?.name || '',
        studentNames: g.members.map((m) => `${m.student.name} (${m.student.roll})`).join(', '),
      })),
    };
  } catch (err) {
    return { error: `Failed to load Showcase Products: ${(err as Error).message}` };
  }
}

export async function saveShowcaseProductAction(input: z.infer<typeof ProductSchema>) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Admin access required.' };
  }

  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid product data.' };
  }

  try {
    const data = {
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      category: parsed.data.category.trim(),
      trlLevel: parsed.data.trlLevel,
      demoUrl: parsed.data.demoUrl?.trim() || null,
      patentStatus: parsed.data.patentStatus?.trim() || null,
      groupId: parsed.data.groupId || null,
      batchId: parsed.data.batchId || null,
      supervisorName: parsed.data.supervisorName?.trim() || null,
      studentNames: parsed.data.studentNames?.trim() || null,
      featured: parsed.data.featured,
    };

    if (parsed.data.id) {
      await prisma.showcaseProduct.update({ where: { id: parsed.data.id }, data });
    } else {
      await prisma.showcaseProduct.create({ data });
    }

    revalidatePath('/admin/showcase/products');
    return { success: true, message: 'Showcase product saved.' };
  } catch (err) {
    return { error: `Failed to save product: ${(err as Error).message}` };
  }
}

export async function deleteShowcaseProductAction(id: string) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Admin access required.' };
  }

  try {
    await prisma.showcaseProduct.delete({ where: { id } });
    revalidatePath('/admin/showcase/products');
    return { success: true, message: 'Product removed from Showcase.' };
  } catch (err) {
    return { error: `Failed to delete product: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. Admin / Showcase: Industry Collaborations CRUD
// ----------------------------------------------------
export async function getIndustryCollaborationsAction() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Admin access required.' };
  }

  try {
    const [collaborations, groups, industryTopics] = await Promise.all([
      prisma.industryCollaboration.findMany({
        orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.group.findMany({
        include: {
          topic: { select: { code: true, title: true } },
          supervisor: { select: { name: true } },
        },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      }),
      prisma.topic?.findMany
        ? prisma.topic.findMany({
            where: { isIndustryCollaborative: true },
            include: {
              proposer: { select: { name: true, email: true } },
              groups: {
                select: {
                  id: true,
                  number: true,
                  batchId: true,
                  supervisor: { select: { name: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const groupById = new Map(groups.map((g) => [g.id, g]));

    const manualRows = collaborations.map((c) => {
      const linkedGroup = c.groupId ? groupById.get(c.groupId) : undefined;
      return {
        ...c,
        topicCode: linkedGroup?.topic?.code || null,
        assignedGroupName: linkedGroup
          ? `Group ${linkedGroup.number} (${linkedGroup.batchId})`
          : 'Unassigned',
        isFromTopic: false,
        createdAt: c.createdAt.toISOString(),
      };
    });

    const topicRows = industryTopics.map((t) => {
      const assignedGroupNames =
        t.groups && t.groups.length > 0
          ? t.groups.map((g) => `Group ${g.number} (${g.batchId})`).join(', ')
          : 'Not Assigned Yet';
      const supName =
        t.proposer?.name ||
        t.groups?.[0]?.supervisor?.name ||
        'Supervisor';

      return {
        id: `topic-${t.id}`,
        companyName: t.industryName || t.organization || 'Industry Partner',
        collaborationType: 'Industry Collaborative Project',
        projectTitle: t.title,
        topicCode: t.code,
        assignedGroupName: assignedGroupNames,
        description: t.industryDetails || t.description || null,
        contactPerson: t.proposer?.email || null,
        status: t.status === 'ALLOTTED' || t.status === 'CONFIRMED' ? 'ACTIVE' : t.status,
        startYear: t.createdAt.getFullYear(),
        groupId: t.groups?.[0]?.id || null,
        supervisorName: supName,
        isFromTopic: true,
        createdAt: t.createdAt.toISOString(),
      };
    });

    return {
      success: true,
      collaborations: [...topicRows, ...manualRows],
      groups: groups.map((g) => ({
        id: g.id,
        number: g.number,
        batchId: g.batchId,
        topicCode: g.topic?.code || 'N/A',
        topicTitle: g.topic?.title || `Group ${g.number}`,
        supervisorName: g.supervisor?.name || '',
      })),
    };
  } catch (err) {
    return { error: `Failed to load Industry Collaborations: ${(err as Error).message}` };
  }
}

export async function saveIndustryCollaborationAction(input: z.infer<typeof IndustrySchema>) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Admin access required.' };
  }

  const parsed = IndustrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid collaboration data.' };
  }

  try {
    const data = {
      companyName: parsed.data.companyName.trim(),
      collaborationType: parsed.data.collaborationType.trim(),
      projectTitle: parsed.data.projectTitle.trim(),
      description: parsed.data.description?.trim() || null,
      contactPerson: parsed.data.contactPerson?.trim() || null,
      status: parsed.data.status,
      startYear: parsed.data.startYear,
      groupId: parsed.data.groupId || null,
      supervisorName: parsed.data.supervisorName?.trim() || null,
    };

    if (parsed.data.id) {
      await prisma.industryCollaboration.update({ where: { id: parsed.data.id }, data });
    } else {
      await prisma.industryCollaboration.create({ data });
    }

    revalidatePath('/admin/showcase/industry');
    return { success: true, message: 'Industry collaboration saved.' };
  } catch (err) {
    return { error: `Failed to save industry collaboration: ${(err as Error).message}` };
  }
}

export async function deleteIndustryCollaborationAction(id: string) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Admin access required.' };
  }

  try {
    await prisma.industryCollaboration.delete({ where: { id } });
    revalidatePath('/admin/showcase');
    revalidatePath('/admin/showcase/products');
    revalidatePath('/admin/showcase/industry');
    return { success: true, message: 'Industry collaboration removed.' };
  } catch (err) {
    return { error: `Failed to delete collaboration: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 4. Faculty / Product: Supervisor "Product Ready" Tagging
// ----------------------------------------------------
const FacultyProductSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, 'Product name / title is required.'),
  description: z.string().min(10, 'Please describe your product (at least 10 characters).'),
  category: z.string().min(2).default('Hardware Prototype'),
  trlLevel: z.number().int().min(1).max(9).default(7),
  demoUrl: z.string().max(400).optional(),
  patentStatus: z.string().max(150).optional(),
  taggedTopicIds: z.array(z.string()).min(1, 'Select at least one project leading to this product.'),
});

export async function getFacultyProductsAction() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized: Faculty access required.' };
  }

  const userId = session.user.id;

  try {
    const [products, myTopics, supervisedGroups] = await Promise.all([
      prisma.showcaseProduct.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.topic.findMany({
        where: { proposerId: userId },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          groups: {
            select: {
              id: true,
              number: true,
              batchId: true,
              members: { include: { student: { select: { name: true, roll: true } } } },
            },
          },
        },
        orderBy: { code: 'asc' },
      }),
      prisma.group.findMany({
        where: { supervisorId: userId },
        include: {
          topic: { select: { id: true, code: true, title: true, status: true } },
          members: { include: { student: { select: { name: true, roll: true } } } },
        },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      }),
    ]);

    const projectMap = new Map<
      string,
      {
        id: string;
        code: string;
        title: string;
        status: string;
        groupId: string | null;
        batchId: string | null;
        groupLabel: string | null;
        studentNames: string;
      }
    >();

    for (const t of myTopics) {
      const firstGrp = t.groups?.[0];
      projectMap.set(t.id, {
        id: t.id,
        code: t.code,
        title: t.title,
        status: t.status,
        groupId: firstGrp?.id || null,
        batchId: firstGrp?.batchId || null,
        groupLabel: firstGrp ? `Group ${firstGrp.number} (${firstGrp.batchId})` : null,
        studentNames: firstGrp
          ? firstGrp.members.map((m) => `${m.student.name} (${m.student.roll})`).join(', ')
          : '',
      });
    }

    for (const g of supervisedGroups) {
      if (g.topic && !projectMap.has(g.topic.id)) {
        projectMap.set(g.topic.id, {
          id: g.topic.id,
          code: g.topic.code,
          title: g.topic.title,
          status: g.topic.status,
          groupId: g.id,
          batchId: g.batchId,
          groupLabel: `Group ${g.number} (${g.batchId})`,
          studentNames: g.members.map((m) => `${m.student.name} (${m.student.roll})`).join(', '),
        });
      }
    }

    const projects = Array.from(projectMap.values());

    return {
      success: true,
      projects,
      products: products.map((p) => ({
        ...p,
        taggedTopics: (p.taggedTopicIds || [])
          .map((tid) => projectMap.get(tid))
          .filter((t): t is NonNullable<typeof t> => Boolean(t)),
        createdAt: p.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    return { error: `Failed to load Faculty Products: ${(err as Error).message}` };
  }
}

export async function saveFacultyProductAction(input: z.infer<typeof FacultyProductSchema>) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized: Faculty access required.' };
  }

  const parsed = FacultyProductSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid product details.' };
  }

  const userId = session.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const taggedGroups = await prisma.group.findMany({
      where: { topicId: { in: parsed.data.taggedTopicIds } },
      include: {
        members: { include: { student: { select: { name: true, roll: true } } } },
      },
      orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
    });

    const primaryGroup = taggedGroups[0] || null;
    const allStudentNames = Array.from(
      new Set(
        taggedGroups.flatMap((g) => g.members.map((m) => `${m.student.name} (${m.student.roll})`))
      )
    ).join(', ');

    const data = {
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      category: parsed.data.category.trim(),
      trlLevel: parsed.data.trlLevel,
      demoUrl: parsed.data.demoUrl?.trim() || null,
      patentStatus: parsed.data.patentStatus?.trim() || null,
      groupId: primaryGroup?.id || null,
      batchId: primaryGroup?.batchId || null,
      supervisorName: user?.name || session.user.name || 'Supervisor',
      studentNames: allStudentNames || null,
      ownerUserId: userId,
      taggedTopicIds: parsed.data.taggedTopicIds,
      featured: true,
    };

    if (parsed.data.id) {
      const existing = await prisma.showcaseProduct.findUnique({ where: { id: parsed.data.id } });
      if (!existing || existing.ownerUserId !== userId) {
        return { error: 'Forbidden: You can only edit your own Product Ready entries.' };
      }
      await prisma.showcaseProduct.update({ where: { id: parsed.data.id }, data });
    } else {
      await prisma.showcaseProduct.create({ data });
    }

    revalidatePath('/faculty/product');
    revalidatePath('/admin/showcase');
    revalidatePath('/admin/showcase/products');

    return { success: true, message: 'Product Ready entry saved and synced to Admin Showcase.' };
  } catch (err) {
    return { error: `Failed to save Product Ready entry: ${(err as Error).message}` };
  }
}

export async function deleteFacultyProductAction(id: string) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized: Faculty access required.' };
  }

  try {
    const existing = await prisma.showcaseProduct.findUnique({ where: { id } });
    if (!existing || existing.ownerUserId !== session.user.id) {
      return { error: 'Forbidden: You can only delete your own Product Ready entries.' };
    }

    await prisma.showcaseProduct.delete({ where: { id } });
    revalidatePath('/faculty/product');
    revalidatePath('/admin/showcase');
    revalidatePath('/admin/showcase/products');
    return { success: true, message: 'Product Ready entry removed.' };
  } catch (err) {
    return { error: `Failed to delete Product Ready entry: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 5. Faculty / Models & Admin Showcase Working Models
// ----------------------------------------------------
const WorkingModelSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, 'Model name / title is required.'),
  platform: z.string().min(2).default('FPGA'),
  objective: z.string().min(5, 'Please describe the objective of the working model.'),
  functionality: z.string().min(5, 'Please describe the functionality of the working model.'),
  componentsUsed: z.string().min(3, 'Please list the main components (microcontrollers, peripherals, ICs, etc.).'),
  simulationResults: z.string().max(4000).optional(),
  demoUrl: z.string().max(400).optional(),
  taggedTopicIds: z.array(z.string()).min(1, 'Select at least one project that implemented this model.'),
});

export async function getFacultyModelsAction() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized: Faculty access required.' };
  }

  const userId = session.user.id;

  try {
    const [models, myTopics, supervisedGroups] = await Promise.all([
      prisma.workingModel.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.topic.findMany({
        where: { proposerId: userId },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          groups: {
            select: {
              id: true,
              number: true,
              batchId: true,
              members: { include: { student: { select: { name: true, roll: true } } } },
            },
          },
        },
        orderBy: { code: 'asc' },
      }),
      prisma.group.findMany({
        where: { supervisorId: userId },
        include: {
          topic: { select: { id: true, code: true, title: true, status: true } },
          members: { include: { student: { select: { name: true, roll: true } } } },
        },
        orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
      }),
    ]);

    const projectMap = new Map<
      string,
      {
        id: string;
        code: string;
        title: string;
        status: string;
        groupLabel: string | null;
        studentNames: string;
      }
    >();

    for (const t of myTopics) {
      const firstGrp = t.groups?.[0];
      projectMap.set(t.id, {
        id: t.id,
        code: t.code,
        title: t.title,
        status: t.status,
        groupLabel: firstGrp ? `Group ${firstGrp.number} (${firstGrp.batchId})` : null,
        studentNames: firstGrp
          ? firstGrp.members.map((m) => `${m.student.name} (${m.student.roll})`).join(', ')
          : '',
      });
    }

    for (const g of supervisedGroups) {
      if (g.topic && !projectMap.has(g.topic.id)) {
        projectMap.set(g.topic.id, {
          id: g.topic.id,
          code: g.topic.code,
          title: g.topic.title,
          status: g.topic.status,
          groupLabel: `Group ${g.number} (${g.batchId})`,
          studentNames: g.members.map((m) => `${m.student.name} (${m.student.roll})`).join(', '),
        });
      }
    }

    return {
      success: true,
      projects: Array.from(projectMap.values()),
      models: models.map((m) => ({
        ...m,
        taggedTopics: (m.taggedTopicIds || [])
          .map((tid) => projectMap.get(tid))
          .filter((t): t is NonNullable<typeof t> => Boolean(t)),
        createdAt: m.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    return { error: `Failed to load working models: ${(err as Error).message}` };
  }
}

export async function saveFacultyModelAction(input: z.infer<typeof WorkingModelSchema>) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized: Faculty access required.' };
  }

  const parsed = WorkingModelSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid model details.' };
  }

  const userId = session.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const taggedGroups = await prisma.group.findMany({
      where: { topicId: { in: parsed.data.taggedTopicIds } },
      include: {
        members: { include: { student: { select: { name: true, roll: true } } } },
      },
      orderBy: [{ batchId: 'desc' }, { number: 'asc' }],
    });

    const primaryGroup = taggedGroups[0] || null;
    const allStudentNames = Array.from(
      new Set(
        taggedGroups.flatMap((g) => g.members.map((m) => `${m.student.name} (${m.student.roll})`))
      )
    ).join(', ');

    const data = {
      title: parsed.data.title.trim(),
      platform: parsed.data.platform.trim(),
      objective: parsed.data.objective.trim(),
      functionality: parsed.data.functionality.trim(),
      componentsUsed: parsed.data.componentsUsed.trim(),
      simulationResults: parsed.data.simulationResults?.trim() || null,
      demoUrl: parsed.data.demoUrl?.trim() || null,
      ownerUserId: userId,
      supervisorName: user?.name || session.user.name || 'Supervisor',
      groupId: primaryGroup?.id || null,
      batchId: primaryGroup?.batchId || null,
      studentNames: allStudentNames || null,
      taggedTopicIds: parsed.data.taggedTopicIds,
    };

    if (parsed.data.id) {
      const existing = await prisma.workingModel.findUnique({ where: { id: parsed.data.id } });
      if (!existing || existing.ownerUserId !== userId) {
        return { error: 'Forbidden: You can only edit your own Working Model entries.' };
      }
      await prisma.workingModel.update({ where: { id: parsed.data.id }, data });
    } else {
      await prisma.workingModel.create({ data });
    }

    revalidatePath('/faculty/models');
    revalidatePath('/admin/showcase');
    revalidatePath('/admin/showcase/models');

    return { success: true, message: 'Working model saved and tagged to selected project(s).' };
  } catch (err) {
    return { error: `Failed to save working model: ${(err as Error).message}` };
  }
}

export async function deleteFacultyModelAction(id: string) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized: Faculty access required.' };
  }

  try {
    const existing = await prisma.workingModel.findUnique({ where: { id } });
    if (!existing || existing.ownerUserId !== session.user.id) {
      return { error: 'Forbidden: You can only delete your own Working Model entries.' };
    }

    await prisma.workingModel.delete({ where: { id } });
    revalidatePath('/faculty/models');
    revalidatePath('/admin/showcase');
    revalidatePath('/admin/showcase/models');
    return { success: true, message: 'Working model removed.' };
  } catch (err) {
    return { error: `Failed to delete working model: ${(err as Error).message}` };
  }
}

export async function getAdminShowcaseModelsAction() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'ADMIN') {
    return { error: 'Unauthorized: Admin access required.' };
  }

  try {
    const [models, topics] = await Promise.all([
      prisma.workingModel.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.topic.findMany({
        select: {
          id: true,
          code: true,
          title: true,
          groups: { select: { id: true, number: true, batchId: true } },
        },
      }),
    ]);

    const topicById = new Map(topics.map((t) => [t.id, t]));

    return {
      success: true,
      models: models.map((m) => ({
        ...m,
        taggedTopics: (m.taggedTopicIds || [])
          .map((tid) => topicById.get(tid))
          .filter((t): t is NonNullable<typeof t> => Boolean(t))
          .map((t) => ({
            id: t.id,
            code: t.code,
            title: t.title,
            groupLabel:
              t.groups && t.groups.length > 0
                ? t.groups.map((g) => `Group ${g.number} (${g.batchId})`).join(', ')
                : null,
          })),
        createdAt: m.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    return { error: `Failed to load working models: ${(err as Error).message}` };
  }
}
