# HITK B.Tech ECE Capstone Project Management System
## Full System Architecture, Mathematical Models & Antigravity Build Specification

---

### 1. Vision & Core Philosophy

The **ECE Capstone Project Management System** is designed for the Department of Electronics and Communication Engineering at **Heritage Institute of Technology, Kolkata (HITK)**. It streamlines B.Tech final-year capstone project workflows for **NBA (National Board of Accreditation)** and **Washington Accord** compliance.

#### Primary Value Propositions:
- **Zero Faculty Burden:** Eliminates manual rubric compilation and paper scorecards. Faculty select or submit project topics, and the platform automatically suggests Washington Accord (**WP1–WP7, WK1–WK9, EA1–EA5**), **SDG 1–17**, and Program Outcome (**PO1–PO11**) mappings.
- **Strict Role Separation:** 
  - `ADMIN` (Project Committee): Configures criteria, bulk-imports topics, uploads allocations, tracks marks completion across semesters, monitors institutional attainment, and endorses capstone status. Admins are structurally prevented from proposing topics.
  - `FACULTY` (Supervisors): Proposes/selects topics, leverages AI to draft 500-word descriptions, reviews mappings, enters marks across Semesters 6, 7, and 8 (Rubrics A–F), and views personal group attainment. Isolated strictly to their own groups.
- **Pure Mathematical Attainment Engine:** Attainment and Capstone qualification are computed via pure functions with zero network/database dependencies.
- **Zero Infrastructure Cost:** Runs on Vercel Hobby + Supabase/Neon PostgreSQL, operating cleanly within serverless execution limits.

---

### 2. High-Level Technology Architecture

- **Web Framework:** Next.js 14+ (App Router) with TypeScript Strict Mode
- **UI & Design:** Tailwind CSS + shadcn/ui + Radix UI
- **Database & Persistence:** Supabase PostgreSQL with pooled connection (`DATABASE_URL`) and direct connection (`DIRECT_URL`) through Prisma ORM
- **Auth & Session Management:** Auth.js (NextAuth v5), invite-only registration, HTTP-only secure cookies
- **AI Abstraction Layer:** OpenAI-compatible endpoint adapter (`/chat/completions`) supporting Google Gemini Flash, Groq, and OpenRouter, with AES-256-GCM encrypted API keys
- **Data Ingestion & Export:** Papa Parse (CSV), ExcelJS (.xlsx), @react-pdf/renderer (NBA evaluation PDFs)
- **Analytics & Visualizations:** Recharts (Donut/Pie charts for faculty groups; heatmaps and bar charts for committee admin)
- **Automated Scheduling:** Vercel Cron invoking `/api/cron/reminders` daily using `CRON_SECRET`
- **Testing:** Vitest for pure engine unit tests; Playwright for end-to-end role isolation verification

---

### 3. Data Architecture (Prisma Schema Summary)

The database consists of 18 normalized models categorized into:
1. **People:** `User` (Admin/Faculty with password hash, active status), `Student` (name, roll, phone, email under DPDP Act 2023 protections).
2. **Academic Catalogue:** `ProgramOutcome` (11 POs), `Attribute` (WP1-7, WK1-9, EA1-5), `WkPoMap` (WK-to-PO associations), `Sdg` (17 goals), `SdgTarget`.
3. **Evaluation Rubrics:** `Rubric` (A through F with maximum marks: 60, 40, 50, 50, 40, 60), `Criterion`, `CriterionMap` (mapping criteria to WP, WK, EA, PO).
4. **Topics & Attributes:** `Topic` (with unique code `SIH...`, `UGR...`, `FAC...`), `TopicSdg`, `TopicAttribute` (level 0-3, reason, origin `RULE|AI|FACULTY`), `DescriptionVersion` (500-word history), `ComplexityDeclaration`.
5. **Allocation & Marks:** `Batch`, `Group`, `GroupMember`, `MarkWindow` (deadline locking), `MarkEntry` (with `examinerSlot` for panel averaging in Rubric D).
6. **Results & Operations:** `AttainmentSnapshot`, `CapstoneDecision`, `AiProvider` (AES-256-GCM encrypted key), `AiCallLog`, `ReminderLog`, `AuditLog`, `Setting`.

---

### 4. Engine Mathematical Specifications (`lib/engine.ts`)

#### 4.1 Topic Qualification Rule
A project qualifies as complex engineering problem work if and only if:
1. $WP1 \ge 2$ (Depth of Knowledge Required)
2. At least 3 of $\{WP2, WP3, WP4, WP5, WP6, WP7\} \ge 2$
3. At least 2 of $\{EA1, EA2, EA3, EA4, EA5\} \ge 2$
4. At least one SDG with a specific target identified

#### 4.2 Program Outcome (PO) Potential
For each $PO_i$ linked to knowledge attributes $WK(PO_i)$:
$$\text{PO\_Potential}(PO_i) = \frac{1}{|WK(PO_i)|} \sum_{k \in WK(PO_i)} \text{level}(k)$$
- Categorized as: **Low** ($< 1.0$), **Medium** ($1.0 \le \text{avg} < 2.0$), **High** ($\ge 2.0$).
- PO8, PO9, and PO10 have no WK linkages in the department catalogue and are flagged as **"Assessed by Rubric"**.

#### 4.3 Capstone Screening Outlook
- **Not yet qualifying:** Topic fails qualification rule.
- **Qualifies:** Topic satisfies qualification rule.
- **Strong:** Topic satisfies qualification rule AND $WP1 = 3$ AND $\ge 4$ of $\{WP2..WP7\} \ge 2$ AND $\ge 3$ of $\{EA1..EA5\} \ge 2$.

#### 4.4 Attainment Calculation Formula
$$\text{Attainment}(X) = \frac{\sum_{c \in C_X} m_c}{\sum_{c \in C_X} M_c}$$
- Attained threshold: Department-locked default **65%** (`0.65`, configurable in Admin Settings).
- Specific limitations: **WP5 & WP7** have no direct rubric criteria; permanently flagged as **"DECLARED"**, never attained.

#### 4.5 Capstone 4-Step Validation Pipeline (`lib/engine/capstone.ts`)
- **Step 1:** Topic scorecard satisfies qualification rule.
- **Step 2:** 7th Semester Panel (Rubric D average across examiner slots): Novelty $\ge 5/7$, Realistic Problem $\ge 5/7$, Societal Impact $\ge 2/3$.
- **Step 3:** 8th Semester External Examiner (Rubric F): Novelty $\ge 6/8$, Realistic Problem $\ge 6/8$, Societal Impact $\ge 2/3$.
- **Step 4:** Supervisor Complexity Declaration confirms unassessed attributes (WP5, WP7, etc.).
- **Missing Marks Policy:** Projects with incomplete evaluation marks across semesters remain in **`PENDING`** state, avoiding premature failure marks.

---

### 5. Multi-Phase Antigravity Build Sequence

- **Phase 0:** Preparation, secrets generation (`AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`), seed documents in `/seed`.
- **Phase 1:** Next.js 14 App Router scaffold, Auth.js credentials sign-in, invite-only tokens, role-based layout sidebar.
- **Phase 2:** Prisma schema deployment & catalogue seed script verification.
- **Phase 3:** Admin Topic Import Wizard (SIH & UG research de-duplication and 100-chunk commits).
- **Phase 4:** AI Console with AES-256-GCM encryption, priority failover, and `AiCallLog`.
- **Phase 5:** Faculty Topic Search with PostgreSQL full-text search, SDG chips, and detail drawer.
- **Phase 6:** Faculty Description editor (500-word limit), AI drafting, attribute mapping review, and code assignment (`FAC-YYYY-XXX`).
- **Phase 7:** Admin Confirmed Topics catalog and multi-format exports (CSV, XLSX, PDF) with formula injection protection.
- **Phase 8:** Allocation upload & supervisor group dashboard with strict horizontal data isolation.
- **Phase 9:** Printable examiner rubrics (A–F) & multi-semester marks entry grid with Rubric D panel averaging.
- **Phase 10:** Attainment engine computation, cached snapshots, faculty donut charts & admin heatmaps.
- **Phase 11:** 4-Step Capstone identification engine & decision board.
- **Phase 12:** Marks completion matrix, one-click manual reminders, and Vercel Cron automated notifications.
- **Phase 13:** Security hardening, E2E test verification, `vercel.json` deployment setup.
