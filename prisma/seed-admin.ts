import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedAdmin() {
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin.project@heritageit.edu';
  const adminName = process.env.INITIAL_ADMIN_NAME || 'Project Committee Admin';
  const rawPassword = process.env.INITIAL_ADMIN_PASSWORD || 'AdminPass@2026';

  console.log(`[Seed Admin] Checking for initial admin: ${adminEmail}`);

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail.toLowerCase() },
  });

  const passwordHash = await bcrypt.hash(rawPassword, 10);

  if (!existing) {
    const admin = await prisma.user.create({
      data: {
        email: adminEmail.toLowerCase(),
        name: adminName,
        passwordHash,
        role: Role.ADMIN,
        active: true,
      },
    });
    console.log(`[Seed Admin] Created initial admin account with ID: ${admin.id}`);
  } else {
    await prisma.user.update({
      where: { email: adminEmail.toLowerCase() },
      data: {
        name: adminName,
        passwordHash,
        role: Role.ADMIN,
        active: true,
      },
    });
    console.log(`[Seed Admin] Updated existing admin credentials for ${adminEmail}`);
  }
}

seedAdmin()
  .catch((e) => {
    console.error('[Seed Admin Error]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
