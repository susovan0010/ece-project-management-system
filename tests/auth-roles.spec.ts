import { test, expect } from '@playwright/test';

test.describe('Health Check Endpoint', () => {
  test('/healthz returns HTTP 200 with status ok', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toContain('ECE Capstone');
  });
});

test.describe('Authentication & Route Protection (Unauthenticated)', () => {
  test('unauthenticated users visiting /admin/dashboard are redirected to /login', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h1')).toContainText('Capstone Management System');
  });

  test('unauthenticated users visiting /faculty/topics are redirected to /login', async ({ page }) => {
    await page.goto('/faculty/topics');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Role-Based Access Control (RBAC Invariants)', () => {
  test('Faculty member attempting to open /admin/* returns HTTP 403 Forbidden', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'faculty.test@heritageit.edu');
    await page.fill('input[name="password"]', 'FacultyPass@2026');
    await page.click('button[type="submit"]');

    // Should redirect to faculty topics
    await expect(page).toHaveURL(/\/faculty\/topics/);

    // Now attempt to open admin dashboard
    const response = await page.goto('/admin/dashboard');
    expect(response?.status()).toBe(403);
    const text = await page.content();
    expect(text).toContain('403');
  });

  test('Admin attempting to open /faculty/topics/new returns HTTP 403 Forbidden', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin.project@heritageit.edu');
    await page.fill('input[name="password"]', 'AdminPass@2026');
    await page.click('button[type="submit"]');

    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/);

    // Invariant 1: Admin can never propose topics
    const response = await page.goto('/faculty/topics/new');
    expect(response?.status()).toBe(403);
    const text = await page.content();
    expect(text).toContain('403');
  });
});
