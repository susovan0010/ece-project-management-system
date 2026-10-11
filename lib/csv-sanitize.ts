// ========================================================
// ECE Capstone Project Management System - CSV & Excel Sanitization
// ========================================================

/**
 * Escapes leading dangerous formula injection characters (=, +, -, @)
 * with a leading single quote (') in accordance with OWASP CSV Injection Guidelines.
 */
export function sanitizeCellForCsv(val: string | null | undefined): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (/^[=+@-]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}
