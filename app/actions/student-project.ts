'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export interface StudentProjectDetails {
  student: {
    id: string;
    name: string;
    roll: string;
    email: string | null;
    phone: string | null;
  };
  group: {
    id: string;
    number: number;
    batchId: string;
  } | null;
  topic: {
    id: string;
    code: string;
    title: string;
    source: string;
    category: string;
    domain: string | null;
    organization: string | null;
    description: string | null;
    tags: string[];
    attributes: Array<{
      code: string;
      title: string;
      kind: string;
      level: number;
      reason: string;
    }>;
    sdgs: Array<{
      sdgId: number;
      title: string;
      target: string | null;
      reason: string | null;
    }>;
  } | null;
  supervisor: {
    id: string;
    name: string;
    email: string;
    domainExpertise: string[];
  } | null;
  members: Array<{
    id: string;
    roll: string;
    name: string;
    email: string | null;
    phone: string | null;
    isCurrentUser: boolean;
  }>;
}

export async function getStudentProjectDetailsAction(): Promise<{
  success: boolean;
  data?: StudentProjectDetails;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized: Please sign in.' };
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== 'STUDENT') {
    return { success: false, error: 'Unauthorized: Student access required.' };
  }
  const userEmail = session.user.email?.toLowerCase().trim();

  try {
    // 1. Locate student record by userId or email
    const student = await prisma.student.findFirst({
      where: {
        OR: [
          { userId: session.user.id },
          userEmail ? { email: { equals: userEmail, mode: 'insensitive' } } : {},
        ],
      },
      include: {
        groups: {
          include: {
            group: {
              include: {
                topic: {
                  include: {
                    sdgs: {
                      include: {
                        sdg: true,
                      },
                    },
                    attributes: {
                      include: {
                        attribute: true,
                      },
                    },
                  },
                },
                supervisor: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    domainExpertise: true,
                  },
                },
                members: {
                  include: {
                    student: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!student) {
      // If signed in as Admin/Faculty, might be viewing without student record
      return {
        success: false,
        error:
          'No student profile found linked to your account. Please contact the Project Committee Administrator.',
      };
    }

    // 2. Extract active group (first group member relation)
    const primaryGroupMember = student.groups[0];
    const group = primaryGroupMember?.group;

    if (!group) {
      return {
        success: true,
        data: {
          student: {
            id: student.id,
            name: student.name,
            roll: student.roll,
            email: student.email,
            phone: student.phone,
          },
          group: null,
          topic: null,
          supervisor: null,
          members: [],
        },
      };
    }

    const topic = group.topic;
    const supervisor = group.supervisor;

    // 3. Map group members
    const members = group.members.map((gm) => ({
      id: gm.student.id,
      roll: gm.student.roll,
      name: gm.student.name,
      email: gm.student.email,
      phone: gm.student.phone,
      isCurrentUser: gm.student.id === student.id,
    }));

    return {
      success: true,
      data: {
        student: {
          id: student.id,
          name: student.name,
          roll: student.roll,
          email: student.email,
          phone: student.phone,
        },
        group: {
          id: group.id,
          number: group.number,
          batchId: group.batchId,
        },
        topic: topic
          ? {
              id: topic.id,
              code: topic.code,
              title: topic.title,
              source: topic.source,
              category: topic.category,
              domain: topic.domain,
              organization: topic.organization,
              description: topic.description,
              tags: topic.tags || [],
              attributes: topic.attributes.map((a) => ({
                code: a.attribute.code,
                title: a.attribute.title,
                kind: a.attribute.kind,
                level: a.level,
                reason: a.reason,
              })),
              sdgs: topic.sdgs.map((s) => ({
                sdgId: s.sdgId,
                title: s.sdg.title,
                target: s.target,
                reason: s.reason,
              })),
            }
          : null,
        supervisor: supervisor
          ? {
              id: supervisor.id,
              name: supervisor.name,
              email: supervisor.email,
              domainExpertise: supervisor.domainExpertise || [],
            }
          : null,
        members,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to load project details: ${(err as Error).message}` };
  }
}
