// ========================================================
// ECE Capstone Project Management System - AI Layer Tests
// Tests encryption, supervisor preference ordering, failover,
// OpenAI adapter mock, and deterministic fallback.
// ========================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptApiKey,
  decryptApiKey,
  orderProvidersByPreference,
  callAiProvider,
  testAiProvider,
  draftDescription,
  mapTopicAttributes,
  evaluateSdgCoSatisfiability,
  suggestSupportedSdgs,
  ProviderConfig,
} from '../lib/ai';

describe('AI Layer: AES-256-GCM Encryption / Decryption', () => {
  it('correctly encrypts and decrypts a plain text API key', () => {
    const rawApiKey = 'gsk_test1234567890abcdefghijklmnopqrstuvwxyz';
    const encrypted = encryptApiKey(rawApiKey);

    // Verify format iv:authTag:ciphertext
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);
    expect(encrypted).not.toContain(rawApiKey);

    // Round-trip decryption
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(rawApiKey);
  });

  it('generates different ciphertexts for the same plaintext due to random 96-bit IV', () => {
    const rawApiKey = 'ai-secret-key-sample';
    const enc1 = encryptApiKey(rawApiKey);
    const enc2 = encryptApiKey(rawApiKey);

    expect(enc1).not.toBe(enc2);
    expect(decryptApiKey(enc1)).toBe(rawApiKey);
    expect(decryptApiKey(enc2)).toBe(rawApiKey);
  });

  it('throws an error when decrypting invalid or tampered ciphertext', () => {
    expect(() => decryptApiKey('invalid-format')).toThrow();
    expect(() => decryptApiKey('iv:auth:broken')).toThrow();
  });
});

describe('AI Layer: Supervisor Provider Preference Ordering', () => {
  const dummyKey = encryptApiKey('test-key');

  const sampleProviders: ProviderConfig[] = [
    { name: 'Google Gemini', baseUrl: 'https://gemini.com', model: 'gemini-1.5-flash', encryptedKey: dummyKey, priority: 1, enabled: true },
    { name: 'Groq', baseUrl: 'https://groq.com', model: 'llama-3.3-70b-versatile', encryptedKey: dummyKey, priority: 2, enabled: true },
    { name: 'ChatGPT', baseUrl: 'https://openai.com', model: 'gpt-4o-mini', encryptedKey: dummyKey, priority: 3, enabled: true },
    { name: 'Disabled AI', baseUrl: 'https://disabled.com', model: 'disabled-model', encryptedKey: dummyKey, priority: 0, enabled: false },
  ];

  it('orders by priority ascending when no supervisor preference is given', () => {
    const ordered = orderProvidersByPreference(sampleProviders);
    expect(ordered.map((p) => p.name)).toEqual(['Google Gemini', 'Groq', 'ChatGPT']);
    expect(ordered.find((p) => p.name === 'Disabled AI')).toBeUndefined();
  });

  it('promotes supervisor preferred provider (e.g. Groq) to index 0, followed by remaining priority', () => {
    const ordered = orderProvidersByPreference(sampleProviders, 'Groq');
    expect(ordered.map((p) => p.name)).toEqual(['Groq', 'Google Gemini', 'ChatGPT']);
  });

  it('promotes supervisor preferred provider (ChatGPT) to index 0', () => {
    const ordered = orderProvidersByPreference(sampleProviders, 'ChatGPT');
    expect(ordered.map((p) => p.name)).toEqual(['ChatGPT', 'Google Gemini', 'Groq']);
  });

  it('falls back to default priority if supervisor preference does not match any provider', () => {
    const ordered = orderProvidersByPreference(sampleProviders, 'Unknown Provider');
    expect(ordered.map((p) => p.name)).toEqual(['Google Gemini', 'Groq', 'ChatGPT']);
  });
});

describe('AI Layer: Adapter, Failover & Rule Fallback', () => {
  const dummyKey = encryptApiKey('test-mock-key');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully completes callAiProvider when fetch succeeds', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: 'Hello from mock AI',
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const provider: ProviderConfig = {
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-1.5-flash',
      encryptedKey: dummyKey,
      priority: 1,
      enabled: true,
    };

    const res = await callAiProvider(provider, [{ role: 'user', content: 'Ping' }]);
    expect(res.text).toBe('Hello from mock AI');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('testAiProvider returns success true on valid ping response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'OK' } }],
      }),
    });

    const provider: ProviderConfig = {
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      encryptedKey: dummyKey,
      priority: 1,
      enabled: true,
    };

    const res = await testAiProvider(provider);
    expect(res.success).toBe(true);
    expect(res.message).toContain('Connection successful');
  });

  it('fails over from failing first provider to second provider in draftDescription', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes('gemini')) {
        // Gemini fails (e.g. rate limit 429)
        return {
          ok: false,
          status: 429,
          text: async () => 'Rate limit exceeded',
        };
      }
      // Groq succeeds
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'This project develops a low-power LoRa based smart agriculture monitoring system.',
              },
            },
          ],
        }),
      };
    });

    const providers: ProviderConfig[] = [
      { name: 'Google Gemini', baseUrl: 'https://gemini.com', model: 'gemini-1.5-flash', encryptedKey: dummyKey, priority: 1, enabled: true },
      { name: 'Groq', baseUrl: 'https://groq.com', model: 'llama-3.3-70b-versatile', encryptedKey: dummyKey, priority: 2, enabled: true },
    ];

    const res = await draftDescription(providers, {
      title: 'Smart Agriculture System',
      category: 'HARDWARE',
    });

    expect(res.providerUsed).toBe('Groq');
    expect(res.description.toLowerCase()).toContain('smart agriculture');
  });

  it('falls back to deterministic template when all AI providers fail in draftDescription', async () => {
    // Both fail
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const providers: ProviderConfig[] = [
      { name: 'Google Gemini', baseUrl: 'https://gemini.com', model: 'gemini-1.5-flash', encryptedKey: dummyKey, priority: 1, enabled: true },
    ];

    const res = await draftDescription(providers, {
      title: 'FPGA Cryptographic Accelerator',
      category: 'HARDWARE',
    });

    expect(res.providerUsed).toContain('Keyword Rule Engine');
    expect(res.description).toContain('FPGA Cryptographic Accelerator');
    expect(res.description).toContain('Level 2');
    expect(res.description).toContain('WP1');
  });

  it('draftDescription integrates existingAbstract, theme, targetAttributes and targetSdgs', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Advanced IoT sensor node for Smart Agriculture addressing SDG 2 (Zero Hunger) with WP1 Depth of Knowledge Level 2.',
            },
          },
        ],
      }),
    });

    const providers: ProviderConfig[] = [
      { name: 'Google Gemini', baseUrl: 'https://gemini.com', model: 'gemini-1.5-flash', encryptedKey: dummyKey, priority: 1, enabled: true },
    ];

    const res = await draftDescription(providers, {
      title: 'Precision IoT Soil Monitoring',
      category: 'HARDWARE',
      theme: 'Precision Agriculture',
      tags: ['LoRa', 'Soil Sensor'],
      existingAbstract: 'Initial faculty draft regarding soil moisture probe calibration.',
      targetAttributes: [
        { code: 'WP1', level: 2, reason: 'Depth of engineering knowledge required' },
        { code: 'WK3', level: 2, reason: 'Specialist engineering knowledge' },
      ],
      targetSdgs: [
        { sdg: 2, target: '2.4', title: 'Zero Hunger' },
      ],
    });

    expect(res.description).toContain('Advanced IoT sensor node');
    expect(res.providerUsed).toBe('Google Gemini');
  });

  it('falls back to evaluateRules in mapTopicAttributes when AI response fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    const providers: ProviderConfig[] = [
      { name: 'Google Gemini', baseUrl: 'https://gemini.com', model: 'gemini-1.5-flash', encryptedKey: dummyKey, priority: 1, enabled: true },
    ];

    const res = await mapTopicAttributes(
      providers,
      {
        title: 'Design of 5G antenna array',
        description: 'Design of a high frequency antenna array for wireless communication.',
        category: 'HARDWARE',
      }
    );

    expect(res.providerUsed).toBe('Keyword Rule Engine');
    expect(res.origin).toBe('RULE');
    expect(res.mapping.attributes.length).toBeGreaterThan(0);
    // Should map antenna / wireless / IoT to WK / WP rules
    const codes = res.mapping.attributes.map((a) => a.code);
    expect(codes.some((c) => c.startsWith('WK'))).toBe(true);
  });

  it('draftDescription explicitly weaves statements of selected WPs, WKs, EAs, and dedicated SDG sentences into abstract', async () => {
    // Test deterministic fallback generation for statement-grounded prose
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'AI offline',
    });

    const providers: ProviderConfig[] = [
      { name: 'Google Gemini', baseUrl: 'https://gemini.com', model: 'gemini-1.5-flash', encryptedKey: dummyKey, priority: 1, enabled: true },
    ];

    const res = await draftDescription(providers, {
      title: 'Solar Powered Smart Grid Telemetry Node',
      category: 'HARDWARE',
      theme: 'Clean Energy & Smart Grid',
      targetAttributes: [
        { code: 'WP1', level: 3, title: 'Depth of Knowledge Required' },
        { code: 'WP2', level: 2, title: 'Range of Conflicting Issues' },
        { code: 'WK3', level: 2, title: 'Discipline Fundamentals' },
        { code: 'EA2', level: 2, title: 'Level of Interactions' },
      ],
      targetSdgs: [
        { sdg: 7, target: '7.2', title: 'Affordable and Clean Energy' },
      ],
    });

    expect(res.description).toContain('Solar Powered Smart Grid Telemetry Node');
    expect(res.description).toContain('WP1');
    expect(res.description).toContain('WP2');
    expect(res.description).toContain('WK3');
    expect(res.description).toContain('EA2');
    expect(res.description).toContain('SDG 7');
    expect(res.description).toContain('Target 7.2');
  });

  it('evaluateSdgCoSatisfiability checks simultaneous co-satisfiability for multiple SDGs', async () => {
    // 1 SDG -> always satisfiable
    const resSingle = await evaluateSdgCoSatisfiability([], {
      title: 'Precision Agriculture Node',
      category: 'HARDWARE',
      selectedSdgs: [{ sdg: 2, target: '2.4', title: 'Zero Hunger' }],
    });
    expect(resSingle.result.satisfiable).toBe(true);

    // 2 Compatible SDGs
    const resCompatible = await evaluateSdgCoSatisfiability([], {
      title: 'Solar IoT Microgrid',
      category: 'HARDWARE',
      selectedSdgs: [
        { sdg: 7, target: '7.2', title: 'Affordable and Clean Energy' },
        { sdg: 9, target: '9.5', title: 'Industry, Innovation and Infrastructure' },
      ],
    });
    expect(resCompatible.result.satisfiable).toBe(true);
    expect(resCompatible.result.incompatibleSdgs.length).toBe(0);

    // Too many disconnected SDGs (> 4) triggers scope stretch fallback
    const resExcessive = await evaluateSdgCoSatisfiability([], {
      title: 'Basic Audio Amplifier',
      category: 'HARDWARE',
      selectedSdgs: [
        { sdg: 1, target: '1.4' },
        { sdg: 2, target: '2.4' },
        { sdg: 3, target: '3.8' },
        { sdg: 6, target: '6.3' },
        { sdg: 14, target: '14.1' },
      ],
    });
    expect(resExcessive.result.satisfiable).toBe(false);
    expect(resExcessive.result.incompatibleSdgs.length).toBeGreaterThan(0);
    expect(resExcessive.result.explanation).toContain('exceeds the realistic scope');
  });

  it('suggestSupportedSdgs recommends domain-specific SDGs for given project', async () => {
    const res = await suggestSupportedSdgs([], {
      title: 'Design of Wearable ECG and Arrhythmia Diagnostic System',
      category: 'HARDWARE',
      theme: 'Biomedical Engineering',
      tags: ['ECG', 'Biomedical', 'Health'],
    });

    expect(res.suggestions.length).toBeGreaterThan(0);
    const sdgIds = res.suggestions.map((s) => s.sdg);
    expect(sdgIds).toContain(3); // SDG 3 Good Health and Well-Being
    expect(res.suggestions.find((s) => s.sdg === 3)?.target).toBe('3.8');
  });
});
