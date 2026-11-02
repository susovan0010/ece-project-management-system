// ========================================================
// ECE Capstone Project Management System
// Admin Priority & Hierarchy Constants / Types (Client-Safe)
// ========================================================

export const DEFAULT_SUPER_ADMIN_EMAIL = 'susovan.mandal@heritageit.edu';
export const PRIORITY_A_ADMIN_EMAIL = DEFAULT_SUPER_ADMIN_EMAIL;

export type AuthorityLevel = 'HOD' | 'SUPER_ADMIN' | 'STANDARD_ADMIN' | 'FACULTY';

/**
 * Checks whether the given user email belongs to the primary Super Admin.
 */
export function isPriorityAAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === PRIORITY_A_ADMIN_EMAIL.toLowerCase();
}
