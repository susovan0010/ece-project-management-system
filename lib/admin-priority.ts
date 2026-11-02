// ========================================================
// ECE Capstone Project Management System
// Admin Priority & Hierarchy Helper
// ========================================================

export const PRIORITY_A_ADMIN_EMAIL = 'susovan.mandal@heritageit.edu';

/**
 * Checks whether the given user email belongs to the Priority Type A (Super Admin).
 */
export function isPriorityAAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === PRIORITY_A_ADMIN_EMAIL.toLowerCase();
}
