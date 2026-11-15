// ========================================================
// Supervisor Project Invitation Window (server-only helper)
// Controls whether faculty can "Confirm as Active" (offer) a project.
// Stored in the Setting table so the state lives in the database.
// ========================================================

import { prisma } from '@/lib/prisma';

export const PROJECT_INVITATION_SETTING_KEY = 'INVITE_PROJECTS_FROM_SUPERVISORS';

export const PROJECT_INVITATION_CLOSED_MESSAGE =
  "Project confirmation is currently closed. The Project Committee Admin has not enabled 'Invite Project from Supervisors'. You can still add, edit and save projects to the Topic Bank as drafts.";

export interface ProjectInvitationState {
  enabled: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export async function readProjectInvitationState(): Promise<ProjectInvitationState> {
  const setting = await prisma.setting.findUnique({
    where: { key: PROJECT_INVITATION_SETTING_KEY },
  });
  const value = (setting?.value ?? {}) as {
    enabled?: boolean;
    updatedAt?: string;
    updatedByName?: string;
  };
  return {
    enabled: value.enabled === true,
    updatedAt: value.updatedAt ?? null,
    updatedByName: value.updatedByName ?? null,
  };
}

export async function isProjectInvitationOpen(): Promise<boolean> {
  return (await readProjectInvitationState()).enabled;
}
