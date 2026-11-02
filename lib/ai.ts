// ========================================================
// ECE Capstone Project Management System - AI Layer & Crypto
// Multi-provider OpenAI-compatible adapter supporting Google Gemini,
// Groq, and ChatGPT with AES-256-GCM encryption, supervisor selection,
// priority failover, and deterministic rule-based fallback.
// ========================================================

import crypto from 'crypto';
import { z } from 'zod';
import { evaluateRules } from './rules';
import { ATTRIBUTE_METADATA, SDG_METADATA } from './attributes-metadata';

// --------------------------------------------------------
// 1. AES-256-GCM Encryption / Decryption Utilities
// --------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts an API key string using AES-256-GCM with the master encryption key from env.
 * Output format: iv:authTag:encryptedText (all hex)
 */
export function encryptApiKey(plaintextKey: string): string {
  const masterKeyBase64 = process.env.APP_ENCRYPTION_KEY || 'default-dev-master-key-32-bytes-base64=';
  // Ensure we have a 32-byte buffer
  let keyBuffer = Buffer.from(masterKeyBase64, 'base64');
  if (keyBuffer.length !== 32) {
    keyBuffer = crypto.createHash('sha256').update(masterKeyBase64).digest();
  }

  const iv = crypto.randomBytes(12); // 96-bit IV
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(plaintextKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted API key stored in the database.
 */
export function decryptApiKey(encryptedPayload: string): string {
  const masterKeyBase64 = process.env.APP_ENCRYPTION_KEY || 'default-dev-master-key-32-bytes-base64=';
  let keyBuffer = Buffer.from(masterKeyBase64, 'base64');
  if (keyBuffer.length !== 32) {
    keyBuffer = crypto.createHash('sha256').update(masterKeyBase64).digest();
  }

  const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted key payload format.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// --------------------------------------------------------
// 2. Structured Zod Schemas for AI Prompts
// --------------------------------------------------------

export const TopicMappingOutputSchema = z.object({
  attributes: z.array(
    z.object({
      code: z.string(), // e.g. "WP1", "WK8", "EA2"
      level: z.number().int().min(0).max(3),
      reason: z.string(),
    })
  ),
  sdgs: z.array(
    z.object({
      sdg: z.number().int().min(1).max(17),
      target: z.string(),
      reason: z.string(),
    })
  ),
  missing: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});

export type TopicMappingOutput = z.infer<typeof TopicMappingOutputSchema>;

// --------------------------------------------------------
// 3. Provider Configurations & Presets
// --------------------------------------------------------

export interface ProviderConfig {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  encryptedKey: string;
  priority: number;
  enabled: boolean;
  dailyLimit?: number;
}

export const AI_PRESETS = [
  {
    name: 'Google Gemini',
    description: 'Google AI Studio Free Tier (Gemini 1.5 Flash)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-1.5-flash',
  },
  {
    name: 'Groq',
    description: 'Groq Cloud Free Tier (Llama 3.3 70B Versatile)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'ChatGPT',
    description: 'OpenAI API (GPT-4o mini)',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
];

// --------------------------------------------------------
// 4. Provider Sorter by Supervisor Preference
// --------------------------------------------------------

export function orderProvidersByPreference(
  providers: ProviderConfig[],
  preferredProviderName?: string
): ProviderConfig[] {
  const enabledProviders = providers.filter((p) => p.enabled);

  if (!preferredProviderName) {
    return [...enabledProviders].sort((a, b) => a.priority - b.priority);
  }

  const preferred = enabledProviders.filter(
    (p) => p.name.toLowerCase() === preferredProviderName.toLowerCase()
  );
  const others = enabledProviders
    .filter((p) => p.name.toLowerCase() !== preferredProviderName.toLowerCase())
    .sort((a, b) => a.priority - b.priority);

  return [...preferred, ...others];
}

// --------------------------------------------------------
// 5. OpenAI-Compatible Adapter with Timeout & 1 Retry
// --------------------------------------------------------

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function callAiProvider(
  provider: ProviderConfig,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  responseFormatJson = false,
  timeoutMs = 12000
): Promise<{ text: string; latencyMs: number }> {
  const apiKey = decryptApiKey(provider.encryptedKey);
  const startTime = Date.now();

  let lastError: Error | null = null;
  // Try up to 2 attempts (initial + 1 retry)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.2,
          ...(responseFormatJson ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI Provider ${provider.name} returned HTTP ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`Empty response content from provider ${provider.name}`);
      }

      const latencyMs = Date.now() - startTime;
      return { text: content, latencyMs };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err as Error;
      if (attempt === 1) {
        // Wait 300ms before retry
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  throw lastError || new Error(`Failed to call AI provider ${provider.name}`);
}

/**
 * Lightweight test ping (sends 5-token ping to verify API key validity)
 */
export async function testAiProvider(provider: ProviderConfig): Promise<{ success: boolean; latencyMs: number; message: string }> {
  try {
    const messages = [
      { role: 'system' as const, content: 'You are an API healthcheck responder.' },
      { role: 'user' as const, content: 'Respond with the single word: OK' },
    ];
    const res = await callAiProvider(provider, messages, false, 8000);
    return {
      success: true,
      latencyMs: res.latencyMs,
      message: `Connection successful (${res.latencyMs}ms). Model response: ${res.text.trim().slice(0, 30)}`,
    };
  } catch (err) {
    return {
      success: false,
      latencyMs: 0,
      message: (err as Error).message || 'Connection test failed.',
    };
  }
}

// --------------------------------------------------------
// --------------------------------------------------------
// 6. Prompt 1: Draft Description (Max 500 words, WP1 >= Level 2, Statement Grounded)
// --------------------------------------------------------

export interface DraftAttributeInput {
  code: string;
  level: number;
  title?: string;
  statement?: string;
  reason?: string;
}

export interface DraftSdgInput {
  sdg: number;
  target?: string;
  title?: string;
  targetDescription?: string;
  reason?: string;
}

export interface DraftDescriptionInput {
  title: string;
  category: string;
  theme?: string;
  keywords?: string[];
  tags?: string[];
  existingAbstract?: string;
  targetAttributes?: DraftAttributeInput[];
  targetSdgs?: DraftSdgInput[];
  sdgHint?: string;
}

export async function draftDescription(
  providers: ProviderConfig[],
  input: DraftDescriptionInput,
  preferredProviderName?: string
): Promise<{ description: string; providerUsed: string; isAi: boolean }> {
  const ordered = orderProvidersByPreference(providers, preferredProviderName);

  const systemPrompt = `You are an expert academic curriculum advisor and NBA accreditation evaluator for B.Tech Electronics and Communication Engineering (ECE) capstone projects.
Draft or rewrite a rigorous, well-structured, professional engineering capstone project abstract of at most 500 words.

MANDATORY ACCREDITATION & STATEMENT GROUNDING REQUIREMENTS:
1. Explicit Statement Satisfaction for Selected Washington Accord Attributes:
   For every selected attribute (WPs, WKs, EAs) with Level >= 1, the abstract MUST explicitly address and weave the actual criterion statement of that attribute into the technical narrative:
   - Complex Problem Solving (WP1..WP7): State how the project embodies the exact WP statements (e.g. for WP1, require depth of knowledge spanning ECE discipline fundamentals; for WP2, resolve conflicting design trade-offs such as latency vs power vs area; for WP3, perform non-obvious analytical modeling; for WP4, address infrequently encountered engineering conditions; for WP5, navigate beyond standard engineering codes).
   - WP1 Depth of Knowledge Mandatory Requirement: WP1 MUST be satisfied at Level 2 (or higher) with concrete mathematical rigor, signal formulation, or system synthesis.
   - Engineering Knowledge (WK1..WK9): Specifically articulate the engineering knowledge used, matching their statements (e.g. WK2 mathematics/numerical methods, WK3 ECE discipline fundamentals, WK4 specialist knowledge in communications/VLSI/signal processing/embedded systems, WK5 design methodologies, WK6 EDA simulation toolchains like MATLAB/CST/Vivado, WK8 research literature synthesis).
   - Complex Engineering Activities (EA1..EA5): Explicitly describe the practical engineering execution, diverse tools and equipment (EA1), interaction resolution (EA2), creative engineering innovation (EA3), and societal/environmental impact (EA4).
2. Concrete Sustainable Development Goals (SDGs) Grounding:
   For EACH selected SDG and target:
   The abstract MUST include dedicated, concrete sentences directly naming the SDG (e.g., "SDG 7 (Target 7.2: Affordable and Clean Energy)") and explicitly explaining the technical engineering mechanism and prototype deliverable by which this project contributes to that specific target.
3. Integration of Faculty Draft:
   If existing notes or a prior abstract are provided, synthesize, preserve, and elevate the core technical concepts into a unified capstone abstract.
4. Word Limit & Format:
   Strictly at most 500 words. Return only the abstract prose without conversational preambles, greetings, or markdown meta-headers.`;

  const kwList = (input.keywords || input.tags || []).join(', ');

  let targetAttrText = 'None specified';
  if (input.targetAttributes && input.targetAttributes.length > 0) {
    const activeAttrs = input.targetAttributes.filter((a) => a.level > 0);
    if (activeAttrs.length > 0) {
      targetAttrText = activeAttrs
        .map((a) => {
          const meta = ATTRIBUTE_METADATA[a.code];
          const title = a.title || meta?.title || a.code;
          const statement = a.statement || meta?.statement || '';
          return `- ${a.code} (${title}) [Level ${a.level}]: Statement: "${statement}"${a.reason ? ` (Rationale: ${a.reason})` : ''}`;
        })
        .join('\n');
    }
  }

  let targetSdgText = input.sdgHint || 'None specified';
  if (input.targetSdgs && input.targetSdgs.length > 0) {
    targetSdgText = input.targetSdgs
      .map((s) => {
        const sdgMeta = SDG_METADATA.find((item) => item.id === s.sdg);
        const sdgTitle = s.title || sdgMeta?.title || `SDG ${s.sdg}`;
        const targetItem = sdgMeta?.targets.find((t) => t.id === s.target);
        const targetDesc = s.targetDescription || targetItem?.description || '';
        return `- SDG ${s.sdg} (${sdgTitle})${s.target ? ` [Target ${s.target}: "${targetDesc}"]` : ''}${s.reason ? ` (Rationale: ${s.reason})` : ''}`;
      })
      .join('\n');
  }

  const userPrompt = `Project Title: ${input.title}
Category: ${input.category}
Project Theme: ${input.theme || 'Electronics and Communication Engineering'}
Technical Keywords: ${kwList}
Mandatory Requirement: WP1 Depth of Knowledge must satisfy at least Level 2.
Target Washington Accord Attributes & Exact Statements:
${targetAttrText}
Target Sustainable Development Goals & Exact Statements:
${targetSdgText}
Existing Faculty Notes / Abstract Draft:
${input.existingAbstract && input.existingAbstract.trim().length > 0 ? input.existingAbstract.trim() : 'No existing draft provided; generate a fresh, comprehensive proposal abstract.'}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  for (const provider of ordered) {
    try {
      const res = await callAiProvider(provider, messages, false);
      const words = res.text.trim().split(/\s+/);
      const capped = words.length > 500 ? words.slice(0, 500).join(' ') : res.text.trim();
      return { description: capped, providerUsed: provider.name, isAi: true };
    } catch {
      continue; // Failover to next provider in sequence
    }
  }

  // Fallback: If all AI providers fail, generate structured template satisfying WP1 >= Level 2 and explicit attribute/SDG statements
  const fallbackKeywords = kwList || 'system design, simulation, and experimental prototyping';
  const activeWps = (input.targetAttributes || []).filter((a) => a.level > 0 && a.code.startsWith('WP'));
  const activeWks = (input.targetAttributes || []).filter((a) => a.level > 0 && a.code.startsWith('WK'));
  const activeEas = (input.targetAttributes || []).filter((a) => a.level > 0 && a.code.startsWith('EA'));
  const activeSdgs = input.targetSdgs || [];

  const wpSentences = activeWps.length > 0
    ? activeWps.map((a) => {
        const meta = ATTRIBUTE_METADATA[a.code];
        return `${a.code} (${meta?.title || a.code}, Level ${a.level}): Resolving this challenge addresses "${meta?.statement || 'in-depth engineering formulation'}".`;
      }).join(' ')
    : 'Depth of Knowledge (WP1 >= Level 2): Resolving these challenges requires in-depth engineering knowledge spanning signal modeling, hardware/software co-design, and quantitative performance evaluation.';

  const wkSentences = activeWks.length > 0
    ? ` The methodology is systematically grounded in ${activeWks.map((a) => `${a.code} (${ATTRIBUTE_METADATA[a.code]?.title || a.code})`).join(', ')}, involving rigorous mathematical formulation and simulation.`
    : '';

  const eaSentences = activeEas.length > 0
    ? ` Execution involves ${activeEas.map((a) => `${a.code} (${ATTRIBUTE_METADATA[a.code]?.title || a.code})`).join(' and ')} across specialized laboratory toolchains.`
    : '';

  const sdgSentences = activeSdgs.length > 0
    ? activeSdgs.map((s) => {
        const meta = SDG_METADATA.find((m) => m.id === s.sdg);
        const tgt = meta?.targets.find((t) => t.id === s.target);
        return `Furthermore, the project directly advances UN SDG ${s.sdg} (${meta?.title || `Goal ${s.sdg}`})${s.target ? ` under Target ${s.target} ("${tgt?.description || ''}")` : ''} through verified prototype deployment.`;
      }).join(' ')
    : `Sustainable Development Alignment: Supports sustainable technology innovation (${input.sdgHint || 'SDG 9: Industry and Infrastructure'}).`;

  const fallback = `Project Title: ${input.title}.
This capstone engineering project addresses key challenges in ${input.category} systems within ${input.theme || 'Electronics and Communication Engineering'}.
${wpSentences}${wkSentences}${eaSentences}
Technical Methodology: Utilizing core techniques in ${fallbackKeywords}, the work integrates analytical modeling, hardware/software synthesis, and experimental bench validation.
Deliverables: The project produces a tested prototype and quantitative verification data meeting departmental standards.
${sdgSentences}`;

  return { description: fallback, providerUsed: 'Keyword Rule Engine (AI Offline)', isAi: false };
}

// --------------------------------------------------------
// 7. Prompt 2: Map Topic against Washington Accord (Zod Validated)
// --------------------------------------------------------

export async function mapTopicAttributes(
  providers: ProviderConfig[],
  input: {
    title: string;
    description: string;
    category: string;
    theme?: string;
    tags?: string[];
  },
  preferredProviderName?: string
): Promise<{ mapping: TopicMappingOutput; providerUsed: string; origin: 'AI' | 'RULE' }> {
  const ordered = orderProvidersByPreference(providers, preferredProviderName);

  const systemPrompt = `You are an NBA accreditation evaluator. Given a capstone project title and description, evaluate its complexity against Washington Accord attributes:
- WP1 to WP7 (Complex Problem Solving, level 0-3)
- WK1 to WK9 (Engineering Knowledge, level 0-3)
- EA1 to EA5 (Complex Engineering Activities, level 0-3)
- SDGs (1-17 with specific target e.g. "7.2")
Respond in JSON format with keys:
"attributes": [{"code": "WP1", "level": 2, "reason": "..."}, ...],
"sdgs": [{"sdg": 7, "target": "7.2", "reason": "..."}],
"missing": ["WP5", "WP7"],
"suggestions": ["Add a trade-off analysis between power and speed."]`;

  const userPrompt = `Project Title: ${input.title}
Category: ${input.category}
Project Theme: ${input.theme || 'Electronics and Communication Engineering'}
Description: ${input.description}
Keywords: ${(input.tags || []).join(', ')}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  for (const provider of ordered) {
    try {
      const res = await callAiProvider(provider, messages, true);
      const json = JSON.parse(res.text);
      const parsed = TopicMappingOutputSchema.safeParse(json);
      if (parsed.success) {
        return { mapping: parsed.data, providerUsed: provider.name, origin: 'AI' };
      }
    } catch {
      continue; // Failover to next provider
    }
  }

  // Graceful degradation: Fallback to deterministic rules in lib/rules.ts
  const ruleRes = evaluateRules(input.title, input.description, input.tags || []);
  const fallbackAttributes = Object.entries(ruleRes.levels).map(([code, level]) => ({
    code,
    level,
    reason: ruleRes.reasons[code] || 'Assigned via deterministic baseline rules.',
  }));

  const fallbackMapping: TopicMappingOutput = {
    attributes: fallbackAttributes,
    sdgs: ruleRes.sdgs,
    missing: ['WP5', 'WP7'],
    suggestions: ['AI providers offline. Baseline attributes generated via department keyword rules.'],
  };

  return { mapping: fallbackMapping, providerUsed: 'Keyword Rule Engine', origin: 'RULE' };
}

// --------------------------------------------------------
// 8. Prompt 3: Evaluate SDG Co-Satisfiability (Zod Validated)
// --------------------------------------------------------

export const SdgCoSatisfiabilityOutputSchema = z.object({
  satisfiable: z.boolean(),
  explanation: z.string(),
  incompatibleSdgs: z.array(z.number()).default([]),
  guidance: z.string(),
});
export type SdgCoSatisfiabilityOutput = z.infer<typeof SdgCoSatisfiabilityOutputSchema>;

export async function evaluateSdgCoSatisfiability(
  providers: ProviderConfig[],
  input: {
    title: string;
    category: string;
    theme?: string;
    tags?: string[];
    abstract?: string;
    selectedSdgs: Array<{ sdg: number; title?: string; target?: string; targetDescription?: string }>;
  },
  preferredProviderName?: string
): Promise<{ result: SdgCoSatisfiabilityOutput; providerUsed: string }> {
  // If 0 or 1 SDG selected, always satisfiable
  if (!input.selectedSdgs || input.selectedSdgs.length <= 1) {
    return {
      result: {
        satisfiable: true,
        explanation:
          input.selectedSdgs && input.selectedSdgs.length === 1
            ? `SDG ${input.selectedSdgs[0].sdg} is well aligned with this project scope.`
            : 'No SDGs currently selected.',
        incompatibleSdgs: [],
        guidance: 'Project scope is focused.',
      },
      providerUsed: 'Validation Rule',
    };
  }

  const ordered = orderProvidersByPreference(providers, preferredProviderName);

  const sdgDetails = input.selectedSdgs
    .map((s) => {
      const meta = SDG_METADATA.find((m) => m.id === s.sdg);
      const tgt = meta?.targets.find((t) => t.id === s.target);
      return `- SDG ${s.sdg}: ${s.title || meta?.title || ''} (Target: ${s.target || 'General'} - "${s.targetDescription || tgt?.description || ''}")`;
    })
    .join('\n');

  const systemPrompt = `You are an expert NBA accreditation and UN Sustainable Development Goals (SDG) evaluation specialist for undergraduate engineering capstone projects.
Given a B.Tech ECE capstone project and a list of selected SDGs, determine whether all selected SDGs are SIMULTANEOUSLY SATISFIABLE within the realistic scope of an undergraduate engineering capstone project.

Evaluation Criteria:
1. Simultaneous Realism: Can a single undergraduate capstone engineering prototype/deliverable genuinely satisfy all these goals simultaneously without overstretching the technical scope or making superficial/tenuous claims?
2. Coherence & Directness: Are the goals synergistic or reasonably connected through the proposed technology (e.g. IoT agricultural sensor naturally satisfies SDG 2 and SDG 12, or smart grid satisfies SDG 7 and SDG 9)?
3. Flag Incompatible/Stretch Goals: If a goal has no realistic engineering grounding in the project (e.g. claiming SDG 14 Life Below Water for an indoor FPGA crypto core or terrestrial antenna with no marine aspect), flag it as incompatible.

Respond strictly in JSON format matching:
{
  "satisfiable": true,
  "explanation": "Detailed explanation of whether they are simultaneously achievable and why.",
  "incompatibleSdgs": [14, 15],
  "guidance": "Clear advice for the faculty on what to adjust or keep."
}`;

  const userPrompt = `Project Title: ${input.title}
Category: ${input.category}
Project Theme: ${input.theme || 'Electronics and Communication Engineering'}
Technical Keywords: ${(input.tags || []).join(', ')}
Project Abstract / Notes: ${input.abstract || 'No abstract draft provided yet.'}

Selected SDGs to Evaluate for Simultaneous Co-Satisfiability:
${sdgDetails}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  for (const provider of ordered) {
    try {
      const res = await callAiProvider(provider, messages, true);
      const json = JSON.parse(res.text);
      const parsed = SdgCoSatisfiabilityOutputSchema.safeParse(json);
      if (parsed.success) {
        return { result: parsed.data, providerUsed: provider.name };
      }
    } catch {
      continue;
    }
  }

  // Deterministic rule fallback
  const sdgIds = input.selectedSdgs.map((s) => s.sdg);
  if (sdgIds.length > 4) {
    const extra = sdgIds.slice(3);
    return {
      result: {
        satisfiable: false,
        explanation: `Selecting ${sdgIds.length} SDGs simultaneously exceeds the realistic scope of an undergraduate B.Tech ECE capstone project. Recommended maximum is 2 to 3 well-grounded SDGs.`,
        incompatibleSdgs: extra,
        guidance: `Consider focusing on your core SDGs (${sdgIds.slice(0, 3).map((id) => `SDG ${id}`).join(', ')}) and deselecting peripheral goals.`,
      },
      providerUsed: 'Keyword Rule Engine (AI Offline)',
    };
  }

  return {
    result: {
      satisfiable: true,
      explanation: `All ${sdgIds.length} selected SDGs (${sdgIds.map((id) => `SDG ${id}`).join(', ')}) appear compatible with the proposed engineering project scope.`,
      incompatibleSdgs: [],
      guidance: 'All selected SDGs can be simultaneously reflected in the project abstract.',
    },
    providerUsed: 'Keyword Rule Engine (AI Offline)',
  };
}

// --------------------------------------------------------
// 9. Prompt 4: Suggest Supported SDGs for Project (Zod Validated)
// --------------------------------------------------------

export const SuggestedSdgsOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      sdg: z.number().int().min(1).max(17),
      title: z.string(),
      target: z.string(),
      targetDescription: z.string(),
      reason: z.string(),
      confidence: z.enum(['HIGH', 'MEDIUM']),
    })
  ),
});
export type SuggestedSdgsOutput = z.infer<typeof SuggestedSdgsOutputSchema>;

export async function suggestSupportedSdgs(
  providers: ProviderConfig[],
  input: {
    title: string;
    category: string;
    theme?: string;
    tags?: string[];
    abstract?: string;
  },
  preferredProviderName?: string
): Promise<{ suggestions: SuggestedSdgsOutput['suggestions']; providerUsed: string }> {
  const ordered = orderProvidersByPreference(providers, preferredProviderName);

  const systemPrompt = `You are an expert UN Sustainable Development Goals (SDG) advisor for B.Tech Electronics and Communication Engineering (ECE) capstone projects.
Analyze the provided project title, category, domain theme, technical keywords, and abstract.
Recommend between 1 and 3 SDGs that are most genuinely, strongly, and realistically supported by this engineering project.
For each recommended SDG, provide:
- "sdg": SDG number (1 to 17)
- "title": SDG official title
- "target": Specific target ID (e.g. "9.5", "7.2", "11.6", "3.8", "2.4")
- "targetDescription": Official target description
- "reason": A concrete engineering rationale explaining how this specific project's hardware/software deliverables support this target
- "confidence": "HIGH" or "MEDIUM"

Respond strictly in JSON format:
{
  "suggestions": [
    {
      "sdg": 9,
      "title": "Industry, Innovation and Infrastructure",
      "target": "9.5",
      "targetDescription": "Enhance scientific research and upgrade technological capabilities.",
      "reason": "Develops novel hardware architecture upgrading domestic technological capabilities.",
      "confidence": "HIGH"
    }
  ]
}`;

  const userPrompt = `Project Title: ${input.title}
Category: ${input.category}
Project Theme: ${input.theme || 'Electronics and Communication Engineering'}
Technical Keywords: ${(input.tags || []).join(', ')}
Project Abstract / Notes: ${input.abstract || 'No abstract draft provided yet.'}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  for (const provider of ordered) {
    try {
      const res = await callAiProvider(provider, messages, true);
      const json = JSON.parse(res.text);
      const parsed = SuggestedSdgsOutputSchema.safeParse(json);
      if (parsed.success && parsed.data.suggestions.length > 0) {
        return { suggestions: parsed.data.suggestions, providerUsed: provider.name };
      }
    } catch {
      continue;
    }
  }

  // Deterministic rule fallback:
  const text = `${input.title} ${input.theme || ''} ${(input.tags || []).join(' ')} ${input.abstract || ''}`.toLowerCase();
  const suggestions: SuggestedSdgsOutput['suggestions'] = [];

  if (text.includes('solar') || text.includes('energy') || text.includes('power') || text.includes('battery')) {
    suggestions.push({
      sdg: 7,
      title: 'Affordable and Clean Energy',
      target: '7.2',
      targetDescription: 'Substantially increase the share of renewable energy in the global energy mix.',
      reason: 'Addresses energy efficiency, renewable generation, or smart power management.',
      confidence: 'HIGH',
    });
  }

  if (
    text.includes('health') ||
    text.includes('medical') ||
    text.includes('ecg') ||
    text.includes('biomedical') ||
    text.includes('patient')
  ) {
    suggestions.push({
      sdg: 3,
      title: 'Good Health and Well-Being',
      target: '3.8',
      targetDescription: 'Achieve universal access to safe effective diagnostics and healthcare technology.',
      reason: 'Develops diagnostic or monitoring instrumentation for healthcare.',
      confidence: 'HIGH',
    });
  }

  if (text.includes('farm') || text.includes('agri') || text.includes('crop') || text.includes('soil')) {
    suggestions.push({
      sdg: 2,
      title: 'Zero Hunger',
      target: '2.4',
      targetDescription: 'Ensure sustainable food production systems and resilient agricultural practices.',
      reason: 'Implements precision agriculture telemetry and soil/crop monitoring.',
      confidence: 'HIGH',
    });
  }

  if (
    text.includes('city') ||
    text.includes('traffic') ||
    text.includes('transport') ||
    text.includes('disaster') ||
    text.includes('pollution')
  ) {
    suggestions.push({
      sdg: 11,
      title: 'Sustainable Cities and Communities',
      target: '11.6',
      targetDescription: 'Reduce the adverse per capita environmental impact of cities including air quality.',
      reason: 'Enables smart urban environmental monitoring, disaster early warning, or traffic optimization.',
      confidence: 'HIGH',
    });
  }

  // Default baseline for ECE hardware/software innovations
  if (suggestions.length === 0) {
    suggestions.push({
      sdg: 9,
      title: 'Industry, Innovation and Infrastructure',
      target: '9.5',
      targetDescription: 'Enhance scientific research and upgrade technological capabilities.',
      reason: 'Fosters domestic engineering innovation and upgrades electronics and communication technology infrastructure.',
      confidence: 'HIGH',
    });
  }

  return { suggestions, providerUsed: 'Keyword Rule Engine (AI Offline)' };
}
