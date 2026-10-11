import { test, expect } from '@playwright/test';

test.describe('Phase 10-13 Route Protection (Unauthenticated)', () => {
  const protectedAdminRoutes = [
    '/admin/attainment',
    '/admin/capstone',
    '/admin/marks-tracker',
    '/admin/audit',
  ];

  for (const route of protectedAdminRoutes) {
    test(`unauthenticated user visiting ${route} is redirected to /login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  const protectedFacultyRoutes = [
    '/faculty/attainment',
    '/faculty/marks',
    '/faculty/rubrics',
  ];

  for (const route of protectedFacultyRoutes) {
    test(`unauthenticated user visiting ${route} is redirected to /login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe('Automated Cron Endpoint Security', () => {
  test('/api/cron/reminders rejects unauthorized requests with 401', async ({ request }) => {
    const res = await request.get('/api/cron/reminders', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });
});
