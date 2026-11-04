'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  draftDescription,
  mapTopicAttributes,
  evaluateSdgCoSatisfiability,
  suggestSupportedSdgs,
  ProviderConfig,
  TopicMappingOutput,
  SdgCoSatisfiabilityOutput,
  SuggestedSdgsOutput,
} from '@/lib/ai';
import { qualifies, Levels } from '@/lib/engine';
import { Origin, TopicSource, TopicStatus } from '@prisma/client';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// Helper to get active AI providers formatted for lib/ai
async function getActiveAiProviders(): Promise<ProviderConfig[]> {
  const dbProviders = await prisma.aiProvider.findMany({
    where: { enabled: true },
    orderBy: { priority: 'asc' },
  });

  return dbProviders.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    model: p.model,
    encryptedKey: p.encryptedKey,
    priority: p.priority,
    enabled: p.enabled,
  }));
}

// ----------------------------------------------------
// 1. Get Next Faculty Code (FAC-YYYY-NNN) & Catalogue
// ----------------------------------------------------
export async function getFacultyProposalMetadataAction() {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized: Only faculty members can propose topics.' };
  }

  try {
    const currentYear = new Date().getFullYear();
    const prefix = `FAC-${currentYear}-`;

    const existingFacultyTopics = await prisma.topic.findMany({
      where: {
        code: { startsWith: prefix },
      },
      select: { code: true },
    });

    let maxNum = 0;
    for (const t of existingFacultyTopics) {
      const numPart = parseInt(t.code.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }

    const nextCode = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;

    // Load academic catalogue: Attributes & SDGs
    const [attributes, sdgs, user] = await Promise.all([
      prisma.attribute.findMany({
        orderBy: [{ kind: 'asc' }, { code: 'asc' }],
      }),
      prisma.sdg.findMany({
        include: { targets: true },
        orderBy: { id: 'asc' },
      }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferredAiProvider: true },
      }),
    ]);

    return {
      nextCode,
      attributes,
      sdgs,
      preferredAiProvider: user?.preferredAiProvider || null,
    };
  } catch (err) {
    return { error: `Failed to load proposal metadata: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 2. AI Draft Abstract Action (Capped at 500 words, WP1 >= Level 2)
// ----------------------------------------------------
export interface GenerateAiDraftParams {
  title: string;
  category: string;
  theme?: string;
  keywords?: string[];
  tags?: string[];
  existingAbstract?: string;
  targetAttributes?: Array<{ code: string; level: number; title?: string; statement?: string; reason?: string }>;
  targetSdgs?: Array<{ sdg: number; target?: string; title?: string; targetDescription?: string; reason?: string }>;
  sdgHint?: string;
}

export async function generateAiDescriptionDraftAction(input: GenerateAiDraftParams) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized.' };
  }

  if (!input.title || input.title.trim().length === 0) {
    return { error: 'Title is required before generating an AI draft.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredAiProvider: true },
    });

    const providers = await getActiveAiProviders();

    const start = Date.now();
    const res = await draftDescription(
      providers,
      input,
      user?.preferredAiProvider || undefined
    );
    const latencyMs = Date.now() - start;

    // Log telemetry
    if (res.isAi) {
      await prisma.aiCallLog.create({
        data: {
          providerName: res.providerUsed,
          userId: session.user.id,
          promptType: 'DRAFT',
          latencyMs,
          success: true,
        },
      });
    }

    const wordCount = res.description.trim().split(/\s+/).length;

    return {
      description: res.description,
      providerUsed: res.providerUsed,
      wordCount,
      isAi: res.isAi,
    };
  } catch (err) {
    return { error: `Failed to draft abstract: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 3. AI Evaluate Washington Accord Complexity Action
// ----------------------------------------------------
export interface EvaluateAiMappingParams {
  title: string;
  description: string;
  category: string;
  theme?: string;
  tags?: string[];
}

export async function evaluateAiTopicMappingAction(input: EvaluateAiMappingParams) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredAiProvider: true },
    });

    const providers = await getActiveAiProviders();

    const start = Date.now();
    const res = await mapTopicAttributes(
      providers,
      input,
      user?.preferredAiProvider || undefined
    );
    const latencyMs = Date.now() - start;

    if (res.origin === 'AI') {
      await prisma.aiCallLog.create({
        data: {
          providerName: res.providerUsed,
          userId: session.user.id,
          promptType: 'MAP',
          latencyMs,
          success: true,
        },
      });
    }

    return {
      mapping: res.mapping,
      providerUsed: res.providerUsed,
      origin: res.origin,
    };
  } catch (err) {
    return { error: `Failed to evaluate complexity mapping: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 4. AI Check SDG Co-Satisfiability Action
// ----------------------------------------------------
export interface CheckSdgCompatibilityParams {
  title: string;
  category: string;
  theme?: string;
  tags?: string[];
  abstract?: string;
  selectedSdgs: Array<{ sdg: number; title?: string; target?: string; targetDescription?: string }>;
}

export async function checkSdgCompatibilityAction(input: CheckSdgCompatibilityParams) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredAiProvider: true },
    });

    const providers = await getActiveAiProviders();
    const res = await evaluateSdgCoSatisfiability(
      providers,
      input,
      user?.preferredAiProvider || undefined
    );

    return {
      result: res.result,
      providerUsed: res.providerUsed,
    };
  } catch (err) {
    return { error: `Failed to evaluate SDG compatibility: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 5. AI Suggest Supported SDGs Action
// ----------------------------------------------------
export interface SuggestSupportedSdgsParams {
  title: string;
  category: string;
  theme?: string;
  tags?: string[];
  abstract?: string;
}

export async function suggestSupportedSdgsAction(input: SuggestSupportedSdgsParams) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredAiProvider: true },
    });

    const providers = await getActiveAiProviders();
    const res = await suggestSupportedSdgs(
      providers,
      input,
      user?.preferredAiProvider || undefined
    );

    return {
      suggestions: res.suggestions,
      providerUsed: res.providerUsed,
    };
  } catch (err) {
    return { error: `Failed to suggest SDGs: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 6. Save Faculty Topic Proposal Action (Creates or Updates Existing Topic)
// ----------------------------------------------------
const SaveProposalSchema = z.object({
  code: z.string().min(1),
  title: z
    .string()
    .min(1, 'Project Title is mandatory and cannot be blank.')
    .refine((s) => s.trim().length > 0, 'Project Title is mandatory and cannot be blank.')
    .refine((s) => s.trim().length >= 3, 'Project Title is mandatory and must be at least 3 characters.'),
  category: z.enum(['Custom', 'Hardware', 'Software', 'Both']),
  domain: z.string().optional(),
  organization: z.string().optional(),
  description: z
    .string()
    .min(1, 'Project Abstract is mandatory and cannot be blank.')
    .refine((s) => s.trim().length > 0, 'Project Abstract is mandatory and cannot be blank.'),
  tags: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'CONFIRMED']).default('CONFIRMED'),
  attributes: z.array(
    z.object({
      code: z.string(), // e.g. "WP1"
      level: z.number().int().min(0).max(3),
      reason: z.string(),
      origin: z.enum(['RULE', 'AI', 'FACULTY']),
    })
  ),
  sdgs: z.array(
    z.object({
      sdgId: z.number().int().min(1).max(17),
      target: z.string().optional(),
      reason: z.string().optional(),
    })
  ),
  isEditingExisting: z.boolean().optional(),
  reEvaluateAiOnConfirm: z.boolean().optional(),
});

export async function saveFacultyTopicProposalAction(formData: z.infer<typeof SaveProposalSchema>) {
  const session = await auth();
  // Strict Role Guard: Only FACULTY can propose topics
  if (!session?.user?.id || (session.user as { role?: string }).role !== 'FACULTY') {
    return { error: 'Unauthorized: Administrators cannot propose or edit topics as proposer.' };
  }

  const userId = session.user.id;

  const parsed = SaveProposalSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const {
    code,
    title,
    category,
    domain,
    organization,
    description,
    tags,
    status,
    attributes,
    sdgs,
    reEvaluateAiOnConfirm,
  } = parsed.data;

  // Strict Mandatory Title Check
  if (!title || title.trim().length === 0) {
    return { error: 'Project Title is mandatory and cannot be blank.' };
  }

  // Strict Mandatory Abstract Check
  if (!description || description.trim().length === 0) {
    return { error: 'Project Abstract is mandatory and cannot be blank.' };
  }

  // Enforce 500-word ceiling strictly
  const words = description.trim().split(/\s+/);
  if (words.length > 500) {
    return { error: `Description exceeds the 500-word limit (${words.length} words provided). Please edit down.` };
  }

  try {
    // Lookup Attribute DB IDs for attributes
    const dbAttributes = await prisma.attribute.findMany();
    const attrCodeToId = new Map(dbAttributes.map((a) => [a.code, a.id]));

    // Check if topic with this code already exists
    const existing = await prisma.topic.findUnique({
      where: { code },
      include: { attributes: true, sdgs: true },
    });

    if (existing) {
      // 1. Authorization: Cannot edit if already claimed by another supervisor
      if (existing.proposerId && existing.proposerId !== userId) {
        return { error: 'This project has already been claimed and confirmed by another supervisor.' };
      }

      // 2. Source-Based Title Lock Check:
      // If source is SIH, title CANNOT be edited.
      let finalTitle = title.trim();
      if (existing.source === TopicSource.SIH) {
        if (finalTitle !== existing.title.trim()) {
          return {
            error:
              'Modification rejected: Titles of SIH projects are locked and cannot be edited. You can edit and refine the abstract.',
          };
        }
        finalTitle = existing.title;
      }
      // If source is UG_RESEARCH (or FACULTY), title can be edited freely.

      // 3. Dynamic AI Re-Tagging of Attributes, SDGs, and POs based on the updated abstract
      let finalAttributes = attributes;
      let finalSdgs = sdgs;

      if (reEvaluateAiOnConfirm || status === 'CONFIRMED') {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { preferredAiProvider: true },
          });
          const providers = await getActiveAiProviders();
          const aiMapRes = await mapTopicAttributes(
            providers,
            {
              title: finalTitle,
              description: description.trim(),
              category,
              theme: domain,
              tags,
            },
            user?.preferredAiProvider || undefined
          );

          if (aiMapRes.mapping?.attributes && aiMapRes.mapping.attributes.length > 0) {
            finalAttributes = aiMapRes.mapping.attributes.map((a) => ({
              code: a.code,
              level: a.level,
              reason: a.reason,
              origin: (aiMapRes.origin as 'RULE' | 'AI' | 'FACULTY') || 'AI',
            }));
          }

          if (aiMapRes.mapping?.sdgs && aiMapRes.mapping.sdgs.length > 0) {
            finalSdgs = aiMapRes.mapping.sdgs.map((s) => ({
              sdgId: s.sdg,
              target: s.target || undefined,
              reason: s.reason || undefined,
            }));
          }
        } catch (aiErr) {
          console.warn('AI dynamic re-tagging fallback to submitted attributes:', aiErr);
        }
      }

      // 4. Update existing topic in transaction
      const topic = await prisma.$transaction(async (tx) => {
        const nextStatus = status === 'CONFIRMED' ? TopicStatus.CONFIRMED : existing.status;
        const updated = await tx.topic.update({
          where: { id: existing.id },
          data: {
            title: finalTitle,
            category,
            domain: domain || null,
            organization: organization || null,
            description: description.trim(),
            tags,
            status: nextStatus,
            proposerId: userId,
          },
        });

        // Delete existing attributes & SDGs
        await tx.topicAttribute.deleteMany({ where: { topicId: existing.id } });
        await tx.topicSdg.deleteMany({ where: { topicId: existing.id } });

        // Insert newly mapped attributes
        for (const attr of finalAttributes) {
          const attributeId = attrCodeToId.get(attr.code);
          if (attributeId) {
            await tx.topicAttribute.create({
              data: {
                topicId: existing.id,
                attributeId,
                level: attr.level,
                reason: attr.reason || `Evaluated via ${attr.origin}`,
                origin: attr.origin as Origin,
              },
            });
          }
        }

        // Insert newly mapped SDGs
        for (const s of finalSdgs) {
          await tx.topicSdg.create({
            data: {
              topicId: existing.id,
              sdgId: s.sdgId,
              target: s.target || null,
              reason: s.reason || null,
            },
          });
        }

        // Record Description Version
        await tx.descriptionVersion.create({
          data: {
            topicId: existing.id,
            description: description.trim(),
            wordCount: words.length,
            createdById: userId,
          },
        });

        // Audit Log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'EDIT_TOPIC_PROPOSAL',
            entity: 'Topic',
            entityId: existing.id,
            payload: {
              code,
              title: finalTitle,
              source: existing.source,
              category,
              status: nextStatus,
              wordCount: words.length,
              attributesCount: finalAttributes.length,
              sdgsCount: finalSdgs.length,
            },
          },
        });

        return updated;
      });

      revalidatePath('/faculty/topics');
      revalidatePath('/faculty/my-topics');
      revalidatePath('/admin/topics');
      revalidatePath('/admin/confirmed');
      return { success: true, topicId: topic.id, code: topic.code, updated: true };
    }

    // ------------------------------------------------------------------
    // Case 2: Proposing a New Topic
    // ------------------------------------------------------------------
    const topic = await prisma.$transaction(async (tx) => {
      const created = await tx.topic.create({
        data: {
          code,
          title: title.trim(),
          source: TopicSource.FACULTY,
          category,
          domain: domain || null,
          organization: organization || null,
          description: description.trim(),
          tags,
          status: status === 'CONFIRMED' ? TopicStatus.CONFIRMED : TopicStatus.DRAFT,
          proposerId: userId,
        },
      });

      // Insert Attributes
      for (const attr of attributes) {
        const attributeId = attrCodeToId.get(attr.code);
        if (attributeId) {
          await tx.topicAttribute.create({
            data: {
              topicId: created.id,
              attributeId,
              level: attr.level,
              reason: attr.reason || `Evaluated via ${attr.origin}`,
              origin: attr.origin as Origin,
            },
          });
        }
      }

      // Insert SDGs
      for (const s of sdgs) {
        await tx.topicSdg.create({
          data: {
            topicId: created.id,
            sdgId: s.sdgId,
            target: s.target || null,
            reason: s.reason || null,
          },
        });
      }

      // Record Description Version
      await tx.descriptionVersion.create({
        data: {
          topicId: created.id,
          description: description.trim(),
          wordCount: words.length,
          createdById: userId,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PROPOSE_TOPIC',
          entity: 'Topic',
          entityId: created.id,
          payload: {
            code,
            title: title.trim(),
            category,
            status,
            wordCount: words.length,
            attributesCount: attributes.length,
            sdgsCount: sdgs.length,
          },
        },
      });

      return created;
    });

    revalidatePath('/faculty/topics');
    revalidatePath('/faculty/my-topics');
    return { success: true, topicId: topic.id, code: topic.code };
  } catch (err) {
    return { error: `Failed to save topic proposal: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------
// 5. Check Live Capstone Qualification
// ----------------------------------------------------
export async function checkCapstoneQualificationAction(levels: Levels, hasSdgTarget: boolean) {
  const isQualified = qualifies(levels, hasSdgTarget);

  const wp1Met = (levels.WP1 ?? 0) >= 2;
  const wpOfSixMet = ['WP2', 'WP3', 'WP4', 'WP5', 'WP6', 'WP7'].filter((k) => (levels[k] ?? 0) >= 2).length >= 3;
  const eaMet = ['EA1', 'EA2', 'EA3', 'EA4', 'EA5'].filter((k) => (levels[k] ?? 0) >= 2).length >= 2;

  return {
    isQualified,
    breakdown: {
      wp1Met,
      wpOfSixMet,
      eaMet,
      hasSdgTarget,
    },
  };
}
