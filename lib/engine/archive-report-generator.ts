// ========================================================
// ECE Capstone Project Management System
// Static Academic Archive Report Generator
// Generates self-contained, printable, standalone HTML & JSON
// for permanent Google Drive Archival of graduating batches
// ========================================================

export interface ArchivedGroupProfile {
  groupId: string;
  groupNumber: number;
  batchId: string;
  topicCode: string;
  topicTitle: string;
  domain: string;
  category: string;
  supervisorName: string;
  supervisorEmail: string;
  students: Array<{
    name: string;
    roll: string;
    badges: {
      diamonds: number;
      gold: number;
      silver: number;
      copper: number;
      iron: number;
      total: number;
    };
  }>;
  attributes: Array<{
    code: string;
    title: string;
    level: number;
    reason: string | null;
  }>;
  sdgs: Array<{
    code: string;
    title: string;
    target: string;
  }>;
  semesterMarks: {
    sem6?: { rubricA?: number; rubricB?: number; total?: number };
    sem7?: { rubricC?: number; rubricD?: number; total?: number };
    sem8?: { rubricE?: number; rubricF?: number; total?: number };
  };
  poAttainments: Array<{
    code: string;
    percentage: number;
    level: number;
    isAttained: boolean;
  }>;
  isCapstone: boolean;
  decisionYear: number;
  decisionNotes?: string | null;
}

export interface BatchArchiveReportPayload {
  batchId: string;
  archivedAt: string;
  archivedByAdmin: string;
  totalGroups: number;
  totalStudents: number;
  capstoneCount: number;
  nonCapstoneCount: number;
  groups: ArchivedGroupProfile[];
  departmentAveragePos: Array<{
    code: string;
    avgPercentage: number;
    level: number;
  }>;
}

/**
 * Generates a self-contained, standalone, beautifully styled HTML document
 * that can be stored on Google Drive and opened on any browser or printed as PDF.
 */
export function generateBatchStaticArchiveHtml(data: BatchArchiveReportPayload): string {
  const {
    batchId,
    archivedAt,
    archivedByAdmin,
    totalGroups,
    totalStudents,
    capstoneCount,
    nonCapstoneCount,
    groups,
    departmentAveragePos,
  } = data;

  const escapeHtml = (str: string | null | undefined) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const poSummaryRows = departmentAveragePos
    .map(
      (p) => `
      <div class="po-card">
        <div class="po-head">
          <span>${p.code}</span>
          <span class="lvl-badge lvl-${p.level}">Level ${p.level}</span>
        </div>
        <div class="po-val">${p.avgPercentage}%</div>
        <div class="progress-bar">
          <div class="progress-fill fill-${p.level}" style="width: ${Math.min(p.avgPercentage, 100)}%;"></div>
        </div>
      </div>
    `
    )
    .join('');

  const groupSections = groups
    .map((g) => {
      const studentPills = g.students
        .map((s) => {
          const badgeText = s.badges.total > 0
            ? `<span class="badge-tag">💎${s.badges.diamonds} 🥇${s.badges.gold} 🥈${s.badges.silver} 🥉${s.badges.copper} ⚙️${s.badges.iron}</span>`
            : '';
          return `
          <div class="student-item">
            <strong>${escapeHtml(s.name)}</strong>
            <span class="roll">(${escapeHtml(s.roll)})</span>
            ${badgeText}
          </div>
        `;
        })
        .join('');

      const attrPills = g.attributes
        .map(
          (a) => `
          <span class="pill pill-attr" title="${escapeHtml(a.reason || a.title)}">
            ${escapeHtml(a.code)}: L${a.level}
          </span>
        `
        )
        .join('');

      const sdgPills = g.sdgs
        .map(
          (s) => `
          <span class="pill pill-sdg" title="Target: ${escapeHtml(s.target)}">
            🌍 ${escapeHtml(s.code)}: ${escapeHtml(s.title)}
          </span>
        `
        )
        .join('');

      const poGrid = g.poAttainments
        .map(
          (p) => `
          <div class="group-po-item ${p.isAttained ? 'attained' : 'not-attained'}">
            <span class="po-code">${p.code}</span>
            <span class="po-pct">${p.percentage}%</span>
            <span class="po-lvl">L${p.level}</span>
          </div>
        `
        )
        .join('');

      return `
        <div class="group-card ${g.isCapstone ? 'capstone-border' : ''}">
          <div class="group-header">
            <div>
              <div class="group-badges">
                <span class="tag tag-group">Group ${g.groupNumber}</span>
                <span class="tag tag-code">${escapeHtml(g.topicCode)}</span>
                <span class="tag tag-domain">${escapeHtml(g.domain)}</span>
                ${
                  g.isCapstone
                    ? `<span class="tag tag-capstone">🌟 Confirmed Capstone (${g.decisionYear})</span>`
                    : `<span class="tag tag-standard">Standard Project</span>`
                }
              </div>
              <h3 class="topic-title">${escapeHtml(g.topicTitle)}</h3>
              <p class="supervisor-line">
                <strong>Supervisor:</strong> ${escapeHtml(g.supervisorName)} 
                <span class="email">&lt;${escapeHtml(g.supervisorEmail)}&gt;</span>
              </p>
            </div>
          </div>

          <div class="card-section">
            <span class="section-label">Student Team Members & Badges</span>
            <div class="student-grid">${studentPills}</div>
          </div>

          <div class="card-section">
            <span class="section-label">Proposal Attributes &amp; SDGs</span>
            <div class="pills-wrap">${attrPills} ${sdgPills}</div>
          </div>

          <div class="card-section">
            <span class="section-label">Program Outcomes (PO) Attainment</span>
            <div class="group-po-grid">${poGrid}</div>
          </div>

          ${
            g.decisionNotes
              ? `
            <div class="card-section notes-section">
              <span class="section-label">Committee Remarks / Notes</span>
              <p class="notes-text">${escapeHtml(g.decisionNotes)}</p>
            </div>
          `
              : ''
          }
        </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Batch ${escapeHtml(batchId)} - ECE Capstone Academic Archive Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #f8fafc; color: #1e293b; padding: 32px 16px; }
    .container { max-width: 1040px; margin: 0 auto; background: #ffffff; border-radius: 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); padding: 40px; border: 1px solid #e2e8f0; }
    
    /* Header */
    .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 28px; margin-bottom: 32px; }
    .inst-title { font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
    .dept-title { font-size: 15px; font-weight: 600; color: #475569; margin-top: 4px; }
    .doc-title { font-size: 24px; font-weight: 800; color: #581c87; margin-top: 14px; }
    .meta-line { font-size: 13px; color: #64748b; margin-top: 8px; }

    /* Summary Bar */
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 32px; }
    .summary-box { background: #f1f5f9; padding: 16px; border-radius: 14px; text-align: center; border: 1px solid #e2e8f0; }
    .summary-val { font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 4px; }
    .summary-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
    .capstone-box { background: #faf5ff; border-color: #d8b4fe; }
    .capstone-box .summary-val { color: #6b21a8; }
    .capstone-box .summary-lbl { color: #7e22ce; }

    /* Department PO Bar */
    .section-title { font-size: 16px; font-weight: 800; color: #0f172a; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
    .po-summary-wrap { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 40px; }
    .po-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; }
    .po-head { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
    .po-val { font-size: 16px; font-weight: 800; margin: 4px 0; color: #0f172a; }
    .lvl-badge { font-size: 9px; padding: 2px 5px; border-radius: 4px; font-weight: 800; }
    .lvl-3 { background: #dcfce7; color: #166534; }
    .lvl-2 { background: #dbeafe; color: #1e40af; }
    .lvl-1 { background: #fef3c7; color: #92400e; }
    .lvl-0 { background: #f1f5f9; color: #475569; }
    .progress-bar { width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; }
    .fill-3 { background: #22c55e; }
    .fill-2 { background: #3b82f6; }
    .fill-1 { background: #f59e0b; }
    .fill-0 { background: #94a3b8; }

    /* Groups List */
    .groups-list { display: flex; flex-direction: column; gap: 20px; }
    .group-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; background: #ffffff; }
    .capstone-border { border-color: #c084fc; box-shadow: 0 4px 12px rgba(192, 132, 252, 0.12); }
    .group-header { border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 12px; }
    .group-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
    .tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 6px; }
    .tag-group { background: #e2e8f0; color: #1e293b; }
    .tag-code { background: #f1f5f9; color: #475569; }
    .tag-domain { background: #e0f2fe; color: #0369a1; }
    .tag-capstone { background: #f3e8ff; color: #7e22ce; font-weight: 800; }
    .tag-standard { background: #f8fafc; color: #64748b; }
    .topic-title { font-size: 17px; font-weight: 800; color: #0f172a; margin: 4px 0; }
    .supervisor-line { font-size: 12px; color: #475569; margin-top: 4px; }
    .email { color: #64748b; font-size: 11px; }

    .card-section { margin-top: 12px; }
    .section-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; display: block; margin-bottom: 6px; }
    .student-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .student-item { font-size: 11px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; }
    .roll { color: #64748b; font-size: 10px; }
    .badge-tag { font-size: 9px; margin-left: 4px; background: #ffffff; padding: 1px 4px; border-radius: 4px; border: 1px solid #cbd5e1; }

    .pills-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: 6px; }
    .pill-attr { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .pill-sdg { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }

    .group-po-grid { display: grid; grid-template-columns: repeat(11, 1fr); gap: 4px; }
    .group-po-item { text-align: center; padding: 4px 2px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 9px; }
    .group-po-item.attained { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
    .group-po-item.not-attained { background: #f8fafc; border-color: #e2e8f0; color: #64748b; }
    .po-code { font-weight: 800; display: block; }
    .po-pct { font-weight: 700; font-size: 10px; display: block; margin: 1px 0; }
    .po-lvl { font-size: 8px; font-weight: 800; }

    .notes-section { background: #faf5ff; border: 1px solid #f3e8ff; padding: 10px; border-radius: 8px; }
    .notes-text { font-size: 11px; color: #6b21a8; font-style: italic; }

    /* Footer */
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }

    @media print {
      body { background: #ffffff; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; }
      .group-card { page-break-inside: avoid; margin-bottom: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="inst-title">Heritage Institute of Technology, Kolkata</div>
      <div class="dept-title">Department of Electronics and Communication Engineering</div>
      <h1 class="doc-title">B.Tech Capstone Project Academic Archive Report</h1>
      <div class="meta-line">
        Academic Batch: <strong>${escapeHtml(batchId)}</strong> • Archived On: <strong>${escapeHtml(archivedAt)}</strong> • Certified by: <strong>${escapeHtml(archivedByAdmin)}</strong>
      </div>
      <div class="meta-line" style="margin-top: 4px; font-size: 11px; color: #7e22ce;">
        Washington Accord (WP1-WP7, WK1-WK9, EA1-EA5) • NBA SAR Criterion 2.2 Compliant Permanent Record
      </div>
    </div>

    <!-- Summary Metrics -->
    <div class="summary-grid">
      <div class="summary-box">
        <div class="summary-lbl">Total Project Groups</div>
        <div class="summary-val">${totalGroups}</div>
      </div>
      <div class="summary-box">
        <div class="summary-lbl">Graduating Students</div>
        <div class="summary-val">${totalStudents}</div>
      </div>
      <div class="summary-box capstone-box">
        <div class="summary-lbl">Confirmed Capstones</div>
        <div class="summary-val">${capstoneCount}</div>
      </div>
      <div class="summary-box">
        <div class="summary-lbl">Standard Projects</div>
        <div class="summary-val">${nonCapstoneCount}</div>
      </div>
    </div>

    <!-- Department PO Average -->
    <div class="section-title">
      <span>📊 Department Program Outcomes (PO) Attainment Profile</span>
    </div>
    <div class="po-summary-wrap">${poSummaryRows}</div>

    <!-- Groups Profiles -->
    <div class="section-title">
      <span>📋 Project Groups &amp; Attainment Scorecards (${groups.length} Records)</span>
    </div>
    <div class="groups-list">
      ${groupSections}
    </div>

    <div class="footer">
      Generated automatically by HITK ECE Capstone Project Management System • Permanent Google Drive Archive
    </div>
  </div>
</body>
</html>`;
}
