import { createDatabaseClient } from '../src/index.js';

const prisma = createDatabaseClient();

const permissions = [
  'org:read',
  'org:update',
  'members:manage',
  'projects:read',
  'projects:write',
  'workspaces:read',
  'workspaces:write',
  'billing:read',
  'billing:manage',
  'admin:read',
  'admin:write',
];

async function main() {
  for (const key of permissions) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: key },
      update: {},
    });
  }

  const owner = await prisma.role.upsert({
    where: { key: 'owner' },
    create: { key: 'owner', name: 'Owner', system: true },
    update: {},
  });

  const member = await prisma.role.upsert({
    where: { key: 'member' },
    create: { key: 'member', name: 'Member', system: true },
    update: {},
  });

  const ownerPermissions = await prisma.permission.findMany();
  const memberPermissions = await prisma.permission.findMany({
    where: { key: { in: ['org:read', 'projects:read', 'projects:write', 'workspaces:read', 'workspaces:write'] } },
  });

  for (const permission of ownerPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: owner.id, permissionId: permission.id } },
      create: { roleId: owner.id, permissionId: permission.id },
      update: {},
    });
  }

  for (const permission of memberPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: member.id, permissionId: permission.id } },
      create: { roleId: member.id, permissionId: permission.id },
      update: {},
    });
  }

  await prisma.plan.upsert({
    where: { key: 'free' },
    create: {
      key: 'free',
      name: 'Free',
      monthlyCents: 0,
      limits: { projects: 3, workspaces: 2, aiTokensMonthly: 100000 },
    },
    update: {},
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
