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
    const [products, groups] = await Promise.all([
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
    ]);

    return {
      success: true,
      products: products.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
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
    const [collaborations, groups] = await Promise.all([
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
    ]);

    return {
      success: true,
      collaborations: collaborations.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
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
    revalidatePath('/admin/showcase/industry');
    return { success: true, message: 'Industry collaboration removed.' };
  } catch (err) {
    return { error: `Failed to delete collaboration: ${(err as Error).message}` };
  }
}
