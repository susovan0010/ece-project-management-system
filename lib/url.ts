import { headers } from 'next/headers';

/**
 * Resolves the application base URL dynamically across Vercel deployments, custom domains, and local dev.
 */
export function getBaseUrl(explicitOrigin?: string | null): string {
  // 1. Explicit origin provided from client browser
  if (explicitOrigin && typeof explicitOrigin === 'string' && explicitOrigin.startsWith('http')) {
    return explicitOrigin.replace(/\/+$/, '');
  }

  // 2. Dynamic request headers (x-forwarded-host / host on Vercel)
  try {
    const h = headers();
    const forwardedHost = h.get('x-forwarded-host');
    const host = forwardedHost || h.get('host');
    const proto = h.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    if (host && !host.includes('localhost')) {
      return `${proto}://${host}`;
    }
  } catch {
    // headers() might not be available in non-request contexts
  }

  // 3. Configured environment variables
  if (process.env.APP_BASE_URL && !process.env.APP_BASE_URL.includes('localhost')) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '');
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.includes('localhost')) {
    return process.env.NEXTAUTH_URL.replace(/\/+$/, '');
  }

  if (process.env.AUTH_URL && !process.env.AUTH_URL.includes('localhost')) {
    return process.env.AUTH_URL.replace(/\/+$/, '');
  }

  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '');
  }

  return 'http://localhost:3000';
}
