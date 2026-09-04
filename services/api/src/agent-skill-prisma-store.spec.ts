import type { DatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';
import { PrismaApiStore } from './prisma-store.js';
import type { CreateAgentSkillArtifactInput, TransitionAgentSkillArtifactInput } from './store.js';
import { TestApiStore } from './tests/test-api-store.js';

const timestamp = new Date('2026-07-15T00:00:00.000Z');

function artifactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'artifact_1',
    projectId: 'project_1',
    workspaceKey: 'workspace_1',
    ownerRepo: 'example/skills',
    skillPath: 'skills/review',
    requestedRef: 'main',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    digest: 'a'.repeat(64),
    sourceUrl: 'https://github.com/example/skills/tree/0123456789abcdef0123456789abcdef01234567/skills/review',
    name: 'review',
    description: 'Review changes safely.',
    license: null,
    compatibility: null,
    declaredAllowedTools: null,
    auditStatus: 'quarantined',
    auditReport: {},
    enabled: false,
    installedPath: null,
    importedByUserId: 'user_1',
    reviewedByUserId: null,
    reviewedAt: null,
    reviewReason: null,
    revokedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function auditEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event_1',
    artifactId: 'artifact_1',
    action: 'imported',
    fromStatus: null,
    toStatus: 'quarantined',
    actorUserId: 'user_1',
    reason: null,
    metadata: {},
    createdAt: timestamp,
    ...overrides,
  };
}

function approvalInput(overrides: Partial<TransitionAgentSkillArtifactInput> = {}): TransitionAgentSkillArtifactInput {
  return {
    projectId: 'project_1',
    artifactId: 'artifact_1',
    digest: 'a'.repeat(64),
    expectedWorkspaceKey: 'workspace_1',
    expectedStatuses: ['quarantined'],
    expectedEnabled: false,
    status: 'approved',
    enabled: true,
    installedPath: '.agents/skills/review',
    actorUserId: 'reviewer_1',
    reason: 'Reviewed exact digest.',
    action: 'approved',
    ...overrides,
  };
}

function createInput(overrides: Partial<CreateAgentSkillArtifactInput> = {}): CreateAgentSkillArtifactInput {
  return {
    projectId: 'project_1',
    workspaceKey: 'workspace_1',
    ownerRepo: 'example/skills',
    skillPath: 'skills/review',
    requestedRef: 'main',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    digest: 'a'.repeat(64),
    sourceUrl: 'https://github.com/example/skills/tree/0123456789abcdef0123456789abcdef01234567/skills/review',
    name: 'review',
    description: 'Review changes safely.',
    bundle: [
      {
        path: 'SKILL.md',
        contentBase64: Buffer.from('---\nname: review\ndescription: Review changes safely.\n---\n').toString('base64'),
        byteLength: 57,
        mode: '100644',
      },
    ],
    auditStatus: 'quarantined',
    auditReport: {},
    importedByUserId: 'user_1',
    ...overrides,
  };
}

function storeWithTransaction(options: { transitionCount: number; existing?: ReturnType<typeof artifactRow> }) {
  const existing = options.existing ?? artifactRow();

  const updated = artifactRow({
    auditStatus: 'approved',
    enabled: true,
    installedPath: '.agents/skills/review',
    reviewedByUserId: 'reviewer_1',
    reviewedAt: timestamp,
  });
  const tx = {
    agentSkillArtifact: {
      findFirst: vi.fn(async () => existing),
      updateMany: vi.fn(async () => ({ count: options.transitionCount })),
      findUniqueOrThrow: vi.fn(async () => updated),
    },
    agentSkillAuditEvent: {
      create: vi.fn(async () => ({ id: 'event_1' })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return {
    store: new PrismaApiStore(prisma as unknown as DatabaseClient),
    tx,
  };
}

describe('PrismaApiStore Agent Skill transitions', () => {
  it('filters artifact lists by the optional workspace boundary and maps that boundary', async () => {
    const findMany = vi.fn(async () => [artifactRow()]);
    const store = new PrismaApiStore({ agentSkillArtifact: { findMany } } as unknown as DatabaseClient);

    await expect(store.listAgentSkillArtifacts('project_1', 'workspace_1')).resolves.toEqual([
      expect.objectContaining({ id: 'artifact_1', projectId: 'project_1', workspaceKey: 'workspace_1' }),
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { projectId: 'project_1', workspaceKey: 'workspace_1' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('queries a bounded bundle-free projection for runtime policy materialization', async () => {
    const findMany = vi.fn(async () => [artifactRow({ auditStatus: 'revoked' })]);
    const store = new PrismaApiStore({ agentSkillArtifact: { findMany } } as unknown as DatabaseClient);

    await expect(
      store.listAgentSkillRuntimePolicyRecords('project_1', 'workspace_1', { take: 4_097 }),
    ).resolves.toEqual([
      {
        id: 'artifact_1',
        projectId: 'project_1',
        workspaceKey: 'workspace_1',
        name: 'review',
        digest: 'a'.repeat(64),
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        auditStatus: 'revoked',
        enabled: false,
        updatedAt: timestamp.toISOString(),
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { projectId: 'project_1', workspaceKey: 'workspace_1' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 4_097,
      select: {
        id: true,
        projectId: true,
        workspaceKey: true,
        name: true,
        digest: true,
        commitSha: true,
        auditStatus: true,
        enabled: true,
        updatedAt: true,
      },
    });
  });

  it('deduplicates imports only inside the same workspace', async () => {
    const findUnique = vi.fn(async () => artifactRow());
    const store = new PrismaApiStore({ agentSkillArtifact: { findUnique } } as unknown as DatabaseClient);

    await expect(store.createAgentSkillArtifact(createInput())).resolves.toMatchObject({ created: false });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        projectId_workspaceKey_ownerRepo_skillPath_digest: {
          projectId: 'project_1',
          workspaceKey: 'workspace_1',
          ownerRepo: 'example/skills',
          skillPath: 'skills/review',
          digest: 'a'.repeat(64),
        },
      },
    });
  });

  it('persists the state and audit event behind one tenant/digest/enabled compare-and-swap', async () => {
    const { store, tx } = storeWithTransaction({ transitionCount: 1 });

    await expect(store.transitionAgentSkillArtifact(approvalInput())).resolves.toMatchObject({
      id: 'artifact_1',
      auditStatus: 'approved',
      enabled: true,
    });
    expect(tx.agentSkillArtifact.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'artifact_1',
        projectId: 'project_1',
        workspaceKey: 'workspace_1',
        digest: 'a'.repeat(64),
        auditStatus: { in: ['quarantined'] },
        enabled: false,
      },
    });
    expect(tx.agentSkillArtifact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: 'project_1',
          workspaceKey: 'workspace_1',
          digest: 'a'.repeat(64),
          auditStatus: { in: ['quarantined'] },
          enabled: false,
        }),
      }),
    );
    expect(tx.agentSkillAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does not append an audit event when a concurrent transition wins the compare-and-swap', async () => {
    const { store, tx } = storeWithTransaction({ transitionCount: 0 });

    await expect(store.transitionAgentSkillArtifact(approvalInput())).resolves.toBeUndefined();
    expect(tx.agentSkillArtifact.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.agentSkillAuditEvent.create).not.toHaveBeenCalled();
  });

  it('refuses to persist an installed path that differs from the audited skill name', async () => {
    const { store, tx } = storeWithTransaction({ transitionCount: 1 });

    await expect(
      store.transitionAgentSkillArtifact(approvalInput({ installedPath: '.agents/skills/other' })),
    ).rejects.toMatchObject({ code: 'AGENT_SKILL_STATE_INVALID', statusCode: 422 });
    expect(tx.agentSkillArtifact.updateMany).not.toHaveBeenCalled();
    expect(tx.agentSkillAuditEvent.create).not.toHaveBeenCalled();
  });

  it('paginates the append-only audit trail with a createdAt/id keyset inside the project scope', async () => {
    const nextTimestamp = new Date('2026-07-14T23:59:59.000Z');
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        auditEventRow({ id: 'event_3' }),
        auditEventRow({ id: 'event_2' }),
        auditEventRow({ id: 'event_1', createdAt: nextTimestamp }),
      ])
      .mockResolvedValueOnce([auditEventRow({ id: 'event_1', createdAt: nextTimestamp })]);
    const store = new PrismaApiStore({ agentSkillAuditEvent: { findMany } } as unknown as DatabaseClient);

    const firstPage = await store.listAgentSkillAuditEvents('project_1', 'artifact_1', { limit: 2 });
    expect(firstPage).toEqual({
      events: [expect.objectContaining({ id: 'event_3' }), expect.objectContaining({ id: 'event_2' })],
      nextCursor: { createdAt: timestamp.toISOString(), id: 'event_2' },
    });
    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { artifactId: 'artifact_1', artifact: { projectId: 'project_1' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });

    const secondPage = await store.listAgentSkillAuditEvents('project_1', 'artifact_1', {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage).toEqual({
      events: [expect.objectContaining({ id: 'event_1', createdAt: nextTimestamp.toISOString() })],
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {
        artifactId: 'artifact_1',
        artifact: { projectId: 'project_1' },
        OR: [{ createdAt: { lt: timestamp } }, { createdAt: timestamp, id: { lt: 'event_2' } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
  });

  it('rejects invalid audit page limits before querying the database', async () => {
    const findMany = vi.fn();
    const store = new PrismaApiStore({ agentSkillAuditEvent: { findMany } } as unknown as DatabaseClient);

    await expect(store.listAgentSkillAuditEvents('project_1', 'artifact_1', { limit: 201 })).rejects.toThrow(
      RangeError,
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('TestApiStore Agent Skill workspace isolation', () => {
  it('keeps identical digests independent across workspaces and rejects a cross-workspace transition', async () => {
    const store = new TestApiStore();
    const first = await store.createAgentSkillArtifact(createInput());
    const second = await store.createAgentSkillArtifact(createInput({ workspaceKey: 'workspace_2' }));

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    await expect(store.listAgentSkillArtifacts('project_1', 'workspace_1')).resolves.toEqual([
      expect.objectContaining({ id: first.record.id, workspaceKey: 'workspace_1' }),
    ]);
    await expect(
      store.transitionAgentSkillArtifact(
        approvalInput({ artifactId: first.record.id, expectedWorkspaceKey: 'workspace_2' }),
      ),
    ).resolves.toBeUndefined();
    expect(store.agentSkillAuditEvents).toHaveLength(2);
  });

  it('uses the id tie-breaker without gaps and never crosses the project boundary', async () => {
    const store = new TestApiStore();
    const { record } = await store.createAgentSkillArtifact(createInput());
    const createdAt = '2026-07-15T00:00:00.000Z';
    store.agentSkillAuditEvents.splice(
      0,
      store.agentSkillAuditEvents.length,
      ...['event_a', 'event_c', 'event_b'].map((eventId) => ({
        id: eventId,
        artifactId: record.id,
        action: 'reviewed',
        toStatus: 'quarantined',
        createdAt,
      })),
    );

    const firstPage = await store.listAgentSkillAuditEvents('project_1', record.id, { limit: 2 });
    expect(firstPage.events.map((event) => event.id)).toEqual(['event_c', 'event_b']);
    expect(firstPage.nextCursor).toEqual({ createdAt, id: 'event_b' });

    const secondPage = await store.listAgentSkillAuditEvents('project_1', record.id, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage).toEqual({ events: [expect.objectContaining({ id: 'event_a' })] });
    await expect(store.listAgentSkillAuditEvents('project_2', record.id)).resolves.toEqual({ events: [] });
  });
});
