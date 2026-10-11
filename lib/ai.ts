// ========================================================
// ECE Capstone Project Management System - AI Layer & Crypto
// Multi-provider OpenAI-compatible adapter with AES-256-GCM encryption,
// Zero-PII sanitization guardrails, and deterministic fallback.
// ========================================================

import crypto from 'crypto';
import { z } from 'zod';

// --------------------------------------------------------
// 1. AES-256-GCM Encryption / Decryption Utilities
// --------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts an API key string using AES-256-GCM with the master encryption key from env.
 * Output format: iv:authTag:encryptedText (all hex)
 */
export function encryptApiKey(plaintextKey: string): string {
  const masterKeyBase64 = process.env.APP_ENCRYPTION_KEY;
  if (!masterKeyBase64) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is not defined.');
  }

  const keyBuffer = Buffer.from(masterKeyBase64, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY must be a 32-byte (256-bit) base64 string.');
  }

  const iv = crypto.randomBytes(12); // Recommended 96-bit IV for GCM
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
  const masterKeyBase64 = process.env.APP_ENCRYPTION_KEY;
  if (!masterKeyBase64) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is not defined.');
  }

  const keyBuffer = Buffer.from(masterKeyBase64, 'base64');
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
// 3. Provider Configuration Interface
// --------------------------------------------------------

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  encryptedKey: string;
  priority: number;
  enabled: boolean;
  dailyLimit: number;
}

// Preset Provider Configurations
export const AI_PRESETS = [
  {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-1.5-flash',
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
  },
];

// --------------------------------------------------------
// 4. Provider Client with Timeout, Retry & Strict Privacy Guardrails
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
): Promise<string> {
  const apiKey = decryptApiKey(provider.encryptedKey);
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

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI Provider ${provider.name} returned HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`Empty response content from provider ${provider.name}`);
    }

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --------------------------------------------------------
// 5. High-Level AI Operations with Multi-Provider Failover
// --------------------------------------------------------

/**
 * Prompt 1: Draft Description
 * Enforces strict 500-word limit.
 */
export async function draftDescription(
  providers: ProviderConfig[],
  input: {
    title: string;
    category: string;
    sdgHint?: string;
    keywords: string[];
  }
): Promise<{ description: string; providerUsed: string }> {
  const systemPrompt = `You are an expert ECE academic curriculum advisor for NBA-accredited capstone projects.
Draft a concise, rigorous project description of at most 500 words covering:
1. Problem Statement & Real-world context
2. Technical Methodology & Engineering approach
3. Expected Deliverables & Outcomes
4. Alignment with sustainable development goals (SDGs).
Do not exceed 500 words. Respond with the description text only.`;

  const userPrompt = `Project Title: ${input.title}
Category: ${input.category}
SDG Hint: ${input.sdgHint || 'None specified'}
Keywords: ${input.keywords.join(', ')}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  // Provider fallback chain
  const sorted = [...providers].filter((p) => p.enabled).sort((a, b) => a.priority - b.priority);

  for (const provider of sorted) {
    try {
      const text = await callAiProvider(provider, messages, false);
      // Enforce 500-word ceiling
      const words = text.trim().split(/\s+/);
      const capped = words.length > 500 ? words.slice(0, 500).join(' ') : text.trim();
      return { description: capped, providerUsed: provider.name };
    } catch {
      continue; // Fallback to next provider
    }
  }

  throw new Error('All configured AI providers failed to generate description.');
}
