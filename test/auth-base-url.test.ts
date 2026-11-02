import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBaseUrl } from '../lib/url';

describe('getBaseUrl dynamic resolution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses explicit origin when provided by client browser', () => {
    const url = getBaseUrl('https://ece-project-management-system.vercel.app');
    expect(url).toBe('https://ece-project-management-system.vercel.app');
  });

  it('strips trailing slashes from explicit origin', () => {
    const url = getBaseUrl('https://ece-project-management-system.vercel.app///');
    expect(url).toBe('https://ece-project-management-system.vercel.app');
  });

  it('resolves from VERCEL_PROJECT_PRODUCTION_URL when available', () => {
    delete process.env.APP_BASE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ece-capstone.vercel.app';
    const url = getBaseUrl(null);
    expect(url).toBe('https://ece-capstone.vercel.app');
  });

  it('resolves from VERCEL_URL when available', () => {
    delete process.env.APP_BASE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = 'ece-project-management-system-oha8bw9a9.vercel.app';
    const url = getBaseUrl(null);
    expect(url).toBe('https://ece-project-management-system-oha8bw9a9.vercel.app');
  });

  it('falls back to localhost:3000 in pure local testing without env vars', () => {
    delete process.env.APP_BASE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.AUTH_URL;
    const url = getBaseUrl(null);
    expect(url).toBe('http://localhost:3000');
  });
});
