'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  PROJECT_INVITATION_SETTING_KEY,
  ProjectInvitationState,
  readProjectInvitationState,
} from '@/lib/project-invitation';

// Any signed-in user may read whether the invitation window is open.
export async function getProjectInvitationStatusAction(): Promise<{
  success: boolean;
  state?: ProjectInvitationState;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized: Please sign in.' };
  }
  try {
    return { success: true, state: await readProjectInvitationState() };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Only ADMIN can open / close the "Invite Project from Supervisors" window.
export async function toggleProjectInvitationAction(enabled: boolean): Promise<{
  success: boolean;
  state?: ProjectInvitationState;
  error?: string;
}> {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; name?: string | null } | undefined;
  if (!user?.id || user.role !== 'ADMIN') {
    return {
      success: false,
      error: 'Unauthorized: Only Project Committee Admins can invite projects from supervisors.',
    };
  }

  try {
    const updatedAt = new Date().toISOString();
    const updatedByName = user.name || 'Admin';
    await prisma.setting.upsert({
      where: { key: PROJECT_INVITATION_SETTING_KEY },
      update: { value: { enabled, updatedAt, updatedById: user.id, updatedByName } },
      create: {
        key: PROJECT_INVITATION_SETTING_KEY,
        value: { enabled, updatedAt, updatedById: user.id, updatedByName },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: enabled ? 'OPEN_SUPERVISOR_PROJECT_INVITATION' : 'CLOSE_SUPERVISOR_PROJECT_INVITATION',
        entity: 'Setting',
        entityId: PROJECT_INVITATION_SETTING_KEY,
        payload: { enabled },
      },
    });

    revalidatePath('/admin/allocation');
    revalidatePath('/faculty/topics');
    revalidatePath('/faculty/topics/new');
    revalidatePath('/faculty/my-topics');

    return { success: true, state: { enabled, updatedAt, updatedByName } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
