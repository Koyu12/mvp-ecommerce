import { randomUUID } from 'node:crypto';
import { ADMIN, normaliseEmail } from '@mvp/shared';
import { PrismaClient } from '@prisma/client';

// Makes `email` an Admin, creating the user without a password if needed; the Admin's first
// Google sign-in links to it (ADR 0004). Safe to run again. Signs the user out everywhere, so a
// password session never carries the new role.
export async function seedAdmin(prisma: PrismaClient, email: string) {
  const key = normaliseEmail(email);
  const [user] = await prisma.$transaction([
    prisma.user.upsert({
      where: { email: key },
      create: { id: randomUUID(), name: 'Admin', email: key, role: ADMIN },
      update: { role: ADMIN },
    }),
    prisma.session.deleteMany({ where: { user: { email: key } } }),
  ]);
  return user;
}

// `pnpm --filter @mvp/api seed` after a build; in Compose: `docker compose exec -e ADMIN_EMAIL=you@gmail.com api pnpm seed`.
if (require.main === module) {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error('Set ADMIN_EMAIL to the first Admin’s Google email');
  const prisma = new PrismaClient();
  seedAdmin(prisma, email)
    .then((user) => console.log(`Admin ready: ${user.email}`))
    .finally(() => prisma.$disconnect());
}
