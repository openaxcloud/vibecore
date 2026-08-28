import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { PostgresScheduledTaskRepository } from '../scheduled-tasks-repository.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

runDbTests('scheduled task deletion tombstones', () => {
  it('retains in-flight run identities and permits recreating the same active workflow', async () => {
    const prisma = createDatabaseClient();
    const repository = new PostgresScheduledTaskRepository(prisma);
    const suffix = uniqueSuffix();
    let organizationId: string | undefined;
    let projectId: string | undefined;
    const taskIds: string[] = [];

    try {
      const organization = await prisma.organization.create({
        data: { name: `Scheduled tombstone ${suffix}`, slug: `scheduled-tombstone-${suffix}` },
      });
      organizationId = organization.id;
      const project = await prisma.project.create({
        data: {
          organizationId,
          name: `Scheduled tombstone ${suffix}`,
          slug: `scheduled-tombstone-${suffix}`,
        },
      });
      projectId = project.id;

      const taskInput = {
        organizationId,
        projectId,
        kind: 'WORKFLOW' as const,
        name: 'Retained workflow schedule',
        command: '',
        workflowId: 42,
        cron: '0 * * * *',
        timezone: 'UTC',
        machineSize: 'shared-0.5',
        enabled: true,
        timeoutSeconds: 900,
        concurrency: 'FORBID',
        maxRetries: 0,
        notifyOnFailure: true,
        nextRunAt: new Date(Date.now() + 60_000),
      };
      const task = await repository.createTask(taskInput);
      taskIds.push(task.id);
      const run = await repository.createRun({
        taskId: task.id,
        organizationId,
        projectId,
        status: 'RUNNING',
        trigger: 'schedule',
        scheduledFor: new Date(),
        startedAt: new Date(),
        machineSize: 'shared-0.5',
      });

      await expect(repository.deleteTask(projectId, task.id)).resolves.toBe(true);
      await expect(repository.getProjectTask(projectId, task.id)).resolves.toBeUndefined();
      await expect(repository.getRun(run.id)).resolves.toMatchObject({ id: run.id, taskId: task.id });

      const [tombstone] = await prisma.$queryRawUnsafe<Array<{ deletedAt: Date | null; enabled: boolean }>>(
        `SELECT "deletedAt", enabled FROM "ScheduledTask" WHERE id = $1`,
        task.id,
      );
      expect(tombstone?.deletedAt).toBeInstanceOf(Date);
      expect(tombstone?.enabled).toBe(false);

      const replacement = await repository.createTask(taskInput);
      taskIds.push(replacement.id);
      expect(replacement.id).not.toBe(task.id);
      await expect(repository.listProjectTasks(projectId)).resolves.toEqual([
        expect.objectContaining({ id: replacement.id, workflowId: 42 }),
      ]);
      await expect(repository.deleteTask(projectId, task.id)).resolves.toBe(false);
    } finally {
      if (taskIds.length > 0) {
        await prisma.scheduledTask.deleteMany({ where: { id: { in: taskIds } } }).catch(() => undefined);
      }
      if (projectId) {
        await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
      }
      if (organizationId) {
        await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
