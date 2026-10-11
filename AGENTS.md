# AGENTS.md - ECE Capstone Project Management System

Project: ECE Capstone Project Management System for HITK (B.Tech ECE).
Stack: Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui, Prisma + Postgres (Supabase), Auth.js (credentials, invite-only), Zod, Recharts, @react-pdf/renderer, ExcelJS, Papa Parse, Vitest, Playwright. Deploy target: Vercel.

Roles: ADMIN (project committee) and FACULTY. Admin can never create or edit a topic as proposer. One role per account.

## Mandatory Rules

1. Every route, server action and API handler checks role on the server. Faculty queries are always filtered by the signed-in user's id.
2. Never send student names, roll numbers, phones or emails to any AI provider. AI input is topic text only.
3. All thresholds, the WK-PO map, rubrics and criterion maps live in the database (seeded), not hard-coded. Defaults come from /seed documents.
4. Engine logic (qualification, PO potential, attainment, capstone rule) is in `lib/engine` as pure functions with unit tests.
5. AI output is always validated with Zod and is only a suggestion; the faculty member confirms.
6. API keys are stored encrypted (AES-256-GCM). Never log secrets or return them to the browser.
7. Use environment variables: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET`, `APP_BASE_URL`.
8. Keep requests short for Vercel's free plan: chunk imports, paginate lists.
9. Write a plan artifact first; make small commits; run lint, typecheck and tests before declaring a phase done; do not change the schema without saying so in the plan.
10. Do not invent department data. If a value is missing from /seed, create a clearly marked TODO and ask.

## Washington Accord Attributes & NBA PO Mapping
- WP (Complex Problem Solving): WP1 to WP7
- WK (Engineering Knowledge): WK1 to WK9
- EA (Engineering Activity): EA1 to EA5
- SDGs: 17 Sustainable Development Goals with specific targets
- Program Outcomes: PO1 to PO11 (HITK ECE syllabus)
