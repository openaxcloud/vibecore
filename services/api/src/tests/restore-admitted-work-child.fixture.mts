/** Disposable PostgreSQL fixture. Admits a ticket then waits to be killed. */
import { createDatabaseClient } from '@vibecore/database';
import { PrismaRestoreWorkAdmission, type RestoreWorkScope } from '../database-restore-work-admission.js';

const prisma = createDatabaseClient({ poolMax: 1 });
process.once('message', async (scope: RestoreWorkScope) => {
  try {
    const ticket = await new PrismaRestoreWorkAdmission(prisma).admit(scope);
    process.send?.({ ticket });
  } catch {
    process.send?.({ error: 'SYNTHETIC_WORK_ADMISSION_FAILED' });
  }
});
process.on('disconnect', () => {
  void prisma.$disconnect().finally(() => process.exit(0));
});
