// ========================================================
// ECE Capstone Project Management System - AI Layer & Crypto
// Multi-provider OpenAI-compatible adapter supporting Google Gemini,
// Groq, and ChatGPT with AES-256-GCM encryption, supervisor selection,
// priority failover, and deterministic rule-based fallback.
// ========================================================

import crypto from 'crypto';
import { z } from 'zod';
import { evaluateRules } from './rules';

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
// 6. Prompt 1: Draft Description (Max 500 words, WP1 >= Level 2)
// --------------------------------------------------------

export interface DraftDescriptionInput {
  title: string;
  category: string;
  theme?: string;
  keywords?: string[];
  tags?: string[];
  existingAbstract?: string;
  targetAttributes?: Array<{ code: string; level: number; reason?: string }>;
  targetSdgs?: Array<{ sdg: number; target?: string; title?: string }>;
  sdgHint?: string;
}

export async function draftDescription(
  providers: ProviderConfig[],
  input: DraftDescriptionInput,
  preferredProviderName?: string
): Promise<{ description: string; providerUsed: string; isAi: boolean }> {
  const ordered = orderProvidersByPreference(providers, preferredProviderName);

  const systemPrompt = `You are an expert academic curriculum advisor and NBA accreditation evaluator for B.Tech Electronics and Communication Engineering (ECE) capstone projects.
Draft a rigorous, well-structured, professional engineering project abstract of at most 500 words covering:
1. Problem Statement & Context: Clear engineering challenge within the domain.
2. Technical Methodology & Engineering Design: Technical architecture, simulation/hardware tools, algorithmic formulation, and implementation pipelines.
3. Expected Outcomes & Hardware/Software Prototype Deliverables: Tangible, verifiable deliverables meeting departmental quality benchmarks.
4. Relevance to Sustainable Development Goals (SDGs): Specific alignment with target UN SDGs.

MANDATORY NBA ACCREDITATION REQUIREMENTS:
- Washington Accord WP1 (Depth of Knowledge Required): The abstract MUST explicitly satisfy WP1 at Level 2 (or higher) by demonstrating clear depth of engineering knowledge (e.g. theoretical foundations, analytical formulation, system design, or mathematical rigor) appropriate for a B.Tech ECE capstone project.
- If target Washington Accord attributes (WPs, WKs, EAs) and levels are provided, ensure the abstract text explicitly incorporates, substantiates, and reflects those specific technical dimensions.
- If target SDGs are provided, clearly articulate how the project contributes towards achieving those specific sustainable development targets.
- If an existing faculty abstract or draft notes are provided, synthesize, incorporate, and elevate them into a comprehensive capstone abstract rather than discarding them.
- Do not exceed 500 words. Return abstract prose only without conversational preamble or meta-commentary.`;

  const kwList = (input.keywords || input.tags || []).join(', ');

  let targetAttrText = 'None specified';
  if (input.targetAttributes && input.targetAttributes.length > 0) {
    targetAttrText = input.targetAttributes
      .filter((a) => a.level > 0)
      .map((a) => `${a.code} (Level ${a.level}${a.reason ? `: ${a.reason}` : ''})`)
      .join(', ');
  }

  let targetSdgText = input.sdgHint || 'None specified';
  if (input.targetSdgs && input.targetSdgs.length > 0) {
    targetSdgText = input.targetSdgs
      .map((s) => `SDG ${s.sdg}${s.target ? ` (Target ${s.target})` : ''}${s.title ? `: ${s.title}` : ''}`)
      .join(', ');
  }

  const userPrompt = `Project Title: ${input.title}
Category: ${input.category}
Project Theme: ${input.theme || 'Electronics and Communication Engineering'}
Technical Keywords: ${kwList}
Mandatory Requirement: WP1 Depth of Knowledge must satisfy at least Level 2.
Target Washington Accord Attributes: ${targetAttrText}
Target Sustainable Development Goals: ${targetSdgText}
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

  // Fallback: If all AI providers fail, generate structured template satisfying WP1 >= Level 2
  const fallbackKeywords = kwList || 'system design, simulation, and experimental prototyping';
  const fallback = `Project Title: ${input.title}.
This capstone engineering project addresses key challenges in ${input.category} systems within ${input.theme || 'Electronics and Communication Engineering'}.
Depth of Knowledge (WP1 >= Level 2): Resolving these challenges requires in-depth engineering knowledge spanning signal modeling, hardware/software co-design, and quantitative performance evaluation.
Methodology: Utilizing key techniques in ${fallbackKeywords}, the work involves mathematical formulation, full system modeling, component design, and rigorous validation.
Expected Deliverables: Verified hardware/software implementation aligned with departmental standards and Washington Accord criteria.
SDG Alignment: Supports sustainable technology development (${input.sdgHint || targetSdgText || 'Goal 9: Industry and Innovation'}).`;

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
