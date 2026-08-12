/*
 * TPL-02.6 — mint des acteurs du rejeu remix PII sur l'ENV DE TEST AUDIT.
 * Exécuté DANS le pod api (tsx), donc contre la vraie base Cloud SQL de test.
 * Aucun mock : User / Organization / OrganizationMember / Session sont écrits
 * en base réelle. Le rôle `owner` est celui du seed plateforme (ensureRole).
 *
 * Chemin d'import ABSOLU : le script vit dans /tmp (writable) alors que
 * /runtime est monté en lecture seule, donc la résolution par nom de package
 * ne s'applique pas depuis /tmp.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createDatabaseClient } from '/runtime/node_modules/@vibecore/database/src/index.ts';

const prisma = createDatabaseClient();

const stamp = process.env.STAMP ?? 'x';
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

// Repartir propre : purge des acteurs d'un run précédent (cascade sessions +
// memberships), puis des orgs de test restées orphelines.
await prisma.user.deleteMany({ where: { email: { startsWith: 'tpl026-' } } });
await prisma.organization.deleteMany({ where: { slug: { startsWith: 'tpl026-' } } });

const ownerRole = await prisma.role.findUnique({ where: { key: 'owner' } });

if (!ownerRole) {
  throw new Error('Rôle `owner` absent du seed — impossible de créer un membership réaliste.');
}

async function mint(kind: string, platformAdmin: boolean) {
  const email = `tpl026-${kind}-${stamp}@audit.invalid`;
  const user = await prisma.user.create({
    data: { email, name: `TPL026 ${kind}`, platformAdmin, emailVerifiedAt: new Date() },
  });

  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 6 * 3600 * 1000),

      // requireRecentAdminReauth exige un step-up récent (TTL 300 s) pour
      // /admin/gallery-listings.
      lastReauthAt: new Date(),
    },
  });

  let organizationId: string | null = null;

  if (!platformAdmin) {
    const org = await prisma.organization.create({
      data: {
        slug: `tpl026-${kind}-${stamp}`,
        name: `TPL026 ${kind} org`,
        members: { create: { userId: user.id, roleId: ownerRole!.id } },
      },
    });
    organizationId = org.id;
  }

  return { kind, userId: user.id, email, token, organizationId };
}

const out = [await mint('author', false), await mint('remixer', false), await mint('admin', true)];

console.log(`__RESULT__${JSON.stringify(out)}`);
await prisma.$disconnect();
