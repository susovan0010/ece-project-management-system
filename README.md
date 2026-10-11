# HITK B.Tech ECE Capstone Project Management System
### NBA-Accredited, Washington Accord-Compliant Undergraduate Capstone Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Tests](https://img.shields.io/badge/vitest-96%20passed-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/typescript-strict%20mode-blue)]()
[![Next.js](https://img.shields.io/badge/next.js-14%20App%20Router-black)]()
[![Accreditation](https://img.shields.io/badge/accreditation-NBA%20%7C%20Washington%20Accord-purple)]()

---

## 1. Overview & Vision

The **ECE Capstone Project Management System** is a purpose-built, enterprise-grade academic platform designed specifically for the Department of Electronics and Communication Engineering at **Heritage Institute of Technology, Kolkata (HITK)**.

It digitizes, standardizes, and automates final-year B.Tech capstone project workflows in strict compliance with:
- **NBA (National Board of Accreditation) Criteria 2 & 3** (Self-Assessment Report defense).
- **Washington Accord Graduate Attributes:**
  - **WP1–WP7:** Complex Engineering Problem Solving
  - **WK1–WK9:** Engineering Knowledge Profiles
  - **EA1–EA5:** Complex Engineering Activities
  - **PO1–PO11:** Program Outcomes for B.Tech ECE (HITK Syllabus)
  - **SDG 1–17:** UN Sustainable Development Goals with granular target mapping

---

## 2. Core Architectural Pillars

### 2.1 Pure Mathematical Engine (`lib/engine/`)
Attainment computation, outcome potential modeling, and capstone qualification are implemented as pure TypeScript functions with **zero external or network dependencies**, covered by extensive unit tests:
1. **Topic Qualification Rule:** Evaluates $WP1 \ge 2$, at least 3 of $\{WP2..WP7\} \ge 2$, at least 2 of $\{EA1..EA5\} \ge 2$, and at least one SDG target named.
2. **PO Potential Model:** Weighted average of linked knowledge attributes $\frac{1}{|WK(PO_i)|} \sum \text{level}(k)$ classified as Low ($<1.0$), Medium ($1.0-2.0$), or High ($\ge 2.0$).
3. **Attainment Formula:** $\text{Attainment}(X) = \frac{\sum m_c}{\sum M_c}$ evaluated against the institutional **65% benchmark** (`DEFAULT_ATTAINMENT_TARGET = 0.65`).
4. **4-Step Capstone Validation Pipeline:**
   - **Step 1:** Topic scorecard satisfies qualification rule.
   - **Step 2:** Semester 7 Internal Panel (Rubric D average across examiner slots: Novelty $\ge 5/7$, Realistic Problem $\ge 5/7$, Societal Impact $\ge 2/3$).
   - **Step 3:** Semester 8 External Defense (Rubric F: Novelty $\ge 6/8$, Realistic Problem $\ge 6/8$, Societal Impact $\ge 2/3$).
   - **Step 4:** Supervisor Complexity Declaration sign-off for unassessed attributes (WP5, WP7).
   - **Missing Marks Policy:** Projects with incomplete semester marks automatically remain in **`PENDING`** state.

### 2.2 Strict Role Separation & Invariants
- **`ADMIN` (Project Committee):**
  - Manages academic catalogues and marking windows.
  - Bulk-imports topic workbooks (SIH and UG research).
  - Uploads student-group allocation rosters with pre-flight foreign key validation.
  - Monitors the department marks tracker and dispatches automated reminders.
  - Audits department attainment and endorses final Capstone decisions.
  - **Structural Invariant:** Project Committee Admins are structurally prevented from creating or proposing topics.
- **`FACULTY` (Project Supervisors):**
  - Searches the department topic bank with PostgreSQL full-text search and SDG chips.
  - Drafts original proposals (strictly capped at 500 words with origin tracking `RULE`, `AI`, `FACULTY`).
  - Enters marks across Semesters 6, 7, and 8 (Rubrics A–F) with criteria bounds checking ($0 \le m \le M$).
  - Evaluates real-time PO attainment for their supervised groups.
  - **Horizontal Isolation:** Faculty queries are filtered strictly by `session.user.id`.

### 2.3 Multi-AI Abstraction Layer (`lib/ai.ts`)
- Configurable OpenAI-compatible client adapter supporting **Google Gemini**, **Groq**, and **ChatGPT**.
- Supervisor preference picker allowing faculty to choose their AI assistant on the fly.
- Priority failover: Automatically cascades to the next available provider if one fails or encounters rate limits.
- **Deterministic Rule Fallback:** Falls back cleanly to catalogue templates if all AI providers are offline.
- **AES-256-GCM Encryption:** All API keys are encrypted at rest; never exposed to the client.
- **Zero-PII Protection (DPDP Act 2023):** Student names, roll numbers, emails, and phone numbers are never transmitted to AI endpoints.

---

## 3. Technology Stack

- **Framework:** Next.js 14 App Router (React 18, Server Components & Server Actions)
- **Language:** TypeScript Strict Mode
- **Database & ORM:** PostgreSQL (Supabase / Neon) + Prisma ORM (18 normalized models)
- **Authentication:** Auth.js (NextAuth v5 beta) with HTTP-only secure cookies and invite-only tokens
- **Styling:** Tailwind CSS + Radix UI + Lucide Icons
- **Visual Analytics:** Recharts (responsive bar charts, target benchmark lines, donut split charts)
- **Document Export:** ExcelJS (.xlsx), Papa Parse (CSV with OWASP formula injection protection), and @react-pdf/renderer
- **Testing:** Vitest (unit & integration) and Playwright (end-to-end RBAC verification)
- **Deployment:** Vercel Hobby Tier with zero infrastructure cost

---

## 4. Evaluation Rubrics Breakdown

| Rubric | Semester | Description | Max Marks | Scope |
| :---: | :---: | :--- | :---: | :---: |
| **A** | 6 | Continuous Supervisor Progress Evaluation | 60 | Student & Group |
| **B** | 6 | End-Semester Internal Panel Evaluation | 40 | Student & Group |
| **C** | 7 | Continuous Supervisor Assessment | 50 | Student |
| **D** | 7 | Internal Project Panel Evaluation (Examiner Slots 1..N) | 50 | Group & Student |
| **E** | 8 | Continuous Supervisor Assessment & Final Implementation | 40 | Student |
| **F** | 8 | External Examiner Defense & Prototype Demonstration | 60 | Group & Student |

---

## 5. Getting Started & Local Setup

### 5.1 Prerequisites
- Node.js 18.17+ or Node.js 20+
- PostgreSQL database (local or hosted Supabase/Neon instance)
- Git

### 5.2 Environment Configuration
Create a `.env` file in the project root:

```env
# Database Connections
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

# Authentication & Security
AUTH_SECRET="your-32-byte-hex-auth-secret"
APP_ENCRYPTION_KEY="your-64-character-hex-aes-256-key"
APP_BASE_URL="http://localhost:3000"

# Automated Reminders & Vercel Cron
CRON_SECRET="your-secure-cron-secret-token"
RESEND_API_KEY="re_..."
MAIL_FROM="capstone@heritageit.edu"
```

### 5.3 Database Migration & Seeding
```bash
# Push schema to database
npx prisma db push

# Seed catalogue (11 POs, 9 WKs, 7 WPs, 5 EAs, 17 SDGs, WK-PO map, and Rubrics A–F)
npm run prisma:seed
```

### 5.4 Running the Application
```bash
# Start local development server
npm run dev

# Open in browser
http://localhost:3000
```

---

## 6. Testing & Quality Assurance

### Run Vitest Unit & Integration Tests (96 Tests)
```bash
npm run test
```

### Run Playwright End-to-End Tests
```bash
npm run test:e2e
```

### Run Strict TypeScript Compilation Check
```bash
npx tsc --noEmit
```

### Run Production Build
```bash
# On Windows PowerShell:
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run build

# On Linux/macOS:
NODE_TLS_REJECT_UNAUTHORIZED="0" npm run build
```

---

## 7. Automated Maintenance & Vercel Cron

The platform includes a native Vercel Cron scheduled in `vercel.json`:
- **Schedule:** `0 9 * * *` (Daily at 09:00 UTC)
- **Target Endpoint:** `/api/cron/reminders`
- **Security:** Requires `Authorization: Bearer ${CRON_SECRET}`.
- **Action:** Audits approaching mark deadlines, identifies supervisors with pending entries, dispatches notification notices, and logs actions into `ReminderLog`.

---

## 8. Departmental Compliance Notes
- **DPDP Act 2023:** Student records are retained for exactly one academic cycle post-graduation and subsequently anonymized.
- **OWASP CSV Injection:** All spreadsheet exports sanitize formulas beginning with `=`, `+`, `-`, or `@`.
- **SAR Criterion Defense:** All Washington Accord mappings, descriptive modifications, and marks audit trails are preserved in `AuditLog` and `AttainmentSnapshot` for inspection by visiting NBA evaluation panels.
