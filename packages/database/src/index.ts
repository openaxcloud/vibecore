import { PrismaClient, Prisma } from '../generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

export { PrismaClient, Prisma };

export type DatabaseClient = InstanceType<typeof import('../generated/client/index.js').PrismaClient>;

export function getDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the persistent Prisma/PostgreSQL store.');
  }

  return process.env.DATABASE_URL;
}

export function createDatabaseClient() {
  const adapter = new PrismaPg({
    connectionString: getDatabaseUrl(),
  });

  return new (PrismaClient)({
    adapter,
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });
}
