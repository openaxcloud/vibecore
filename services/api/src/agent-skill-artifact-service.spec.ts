import { describe, expect, it } from 'vitest';
import {
  AgentSkillArtifactError,
  installVerifiedAgentSkill,
  managedAgentSkillMarkerBytes,
  managedAgentSkillMarkerManifest,
  managedAgentSkillMarkerPath,
  removeAgentSkillInstallation,
  type AgentSkillWorkspaceAdapter,
  validateAgentSkillArtifactTransition,
} from './agent-skill-artifact-service.js';
import { computeGithubSkillBundleDigest, type GithubSkillBundleFile } from './skill-source-github.js';
import type { AgentSkillArtifactWithBundleRecord } from './store.js';

function artifact(body = 'Review changes and run tests.'): AgentSkillArtifactWithBundleRecord {
  const skill = `---\nname: review\ndescription: Review changes safely.\n---\n\n${body}`;

  const files: GithubSkillBundleFile[] = [
    {
      path: 'SKILL.md',
      contentBase64: Buffer.from(skill).toString('base64'),
      byteLength: Buffer.byteLength(skill),
      mode: '100644',
    },
    {
      path: 'references/checklist.md',
      contentBase64: Buffer.from('Check tests.').toString('base64'),
      byteLength: Buffer.byteLength('Check tests.'),
      mode: '100644',
    },
  ];

  const timestamp = new Date().toISOString();

  return {
    id: 'artifact_1',
    projectId: 'project_1',
    workspaceKey: 'workspace_1',
    ownerRepo: 'example/skills',
    skillPath: 'skills/review',
    requestedRef: 'main',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    digest: computeGithubSkillBundleDigest(files),
    sourceUrl: 'https://github.com/example/skills/tree/0123456789abcdef0123456789abcdef01234567/skills/review',
    name: 'review',
    description: 'Review changes safely.',
    bundle: files,
    auditStatus: 'quarantined',
    auditReport: {},
    enabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function memoryWorkspace(initial: Record<string, Buffer> = {}) {
  const files = new Map(Object.entries(initial));
  const writes: string[] = [];
  const deletes: string[] = [];

  const adapter: AgentSkillWorkspaceAdapter = {
    async listFiles(root) {
      return [...files.keys()].filter((path) => path.startsWith(`${root}/`));
    },
    async readFile(path) {
      const value = files.get(path);
      return value ? { content: value.toString('base64'), encoding: 'base64' } : undefined;
    },
    async writeFile(file) {
      writes.push(file.path);
      files.set(file.path, Buffer.from(file.content, 'base64'));
    },
    async deleteTree(root) {
      deletes.push(root);

      for (const path of [...files.keys()]) {
        if (path === root || path.startsWith(`${root}/`)) {
          files.delete(path);
        }
      }
    },
  };

  return { adapter, files, writes, deletes };
}

describe('Agent Skill artifact installation', () => {
  it('writes resources first, SKILL.md last, verifies exact bytes, and removes cleanly', async () => {
    const workspace = memoryWorkspace();
    const value = artifact();
    const installed = await installVerifiedAgentSkill(value, workspace.adapter);

    expect(installed).toEqual({ installPath: '.agents/skills/review', alreadyInstalled: false });
    expect(workspace.writes).toEqual([
      '.agents/.vibecore/managed-skills/review.json',
      '.agents/skills/review/references/checklist.md',
      '.agents/skills/review/SKILL.md',
    ]);
    expect(workspace.files.size).toBe(3);
    await expect(removeAgentSkillInstallation(value, workspace.adapter)).resolves.toBe('.agents/skills/review');
    expect(workspace.files.size).toBe(0);
    expect(workspace.deletes).toEqual(['.agents/skills/review', '.agents/.vibecore/managed-skills/review.json']);
  });

  it('builds deterministic scoped marker bytes and an exact manifest', () => {
    const value = artifact();
    const bytes = managedAgentSkillMarkerBytes(value);
    const marker = JSON.parse(bytes.toString('utf8'));

    expect(bytes.toString('utf8').endsWith('\n')).toBe(true);
    expect(marker).toEqual({
      version: 1,
      artifactId: 'artifact_1',
      projectId: 'project_1',
      workspaceKey: 'workspace_1',
      name: 'review',
      digest: value.digest,
      commitSha: value.commitSha,
    });
    expect(managedAgentSkillMarkerPath(value.name)).toBe('.agents/.vibecore/managed-skills/review.json');
    expect(managedAgentSkillMarkerManifest(value)).toEqual({
      path: '.agents/.vibecore/managed-skills/review.json',
      byteLength: bytes.byteLength,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('is idempotent only for the complete exact artifact and rejects collisions', async () => {
    const value = artifact();
    const workspace = memoryWorkspace();
    await installVerifiedAgentSkill(value, workspace.adapter);

    await expect(installVerifiedAgentSkill(value, workspace.adapter)).resolves.toMatchObject({
      alreadyInstalled: true,
    });
    workspace.files.set('.agents/skills/review/SKILL.md', Buffer.from('different'));
    await expect(installVerifiedAgentSkill(value, workspace.adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_COLLISION',
    });
    await expect(removeAgentSkillInstallation(value, workspace.adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_COLLISION',
    });
    expect(workspace.files.get('.agents/skills/review/SKILL.md')?.toString()).toBe('different');
  });

  it('fails closed when exact skill bytes have no marker or the marker belongs to another artifact', async () => {
    const value = artifact();
    const withoutMarker = memoryWorkspace({
      '.agents/skills/review/SKILL.md': Buffer.from(value.bundle[0]!.contentBase64, 'base64'),
      '.agents/skills/review/references/checklist.md': Buffer.from(value.bundle[1]!.contentBase64, 'base64'),
    });

    await expect(installVerifiedAgentSkill(value, withoutMarker.adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_COLLISION',
    });
    await expect(removeAgentSkillInstallation(value, withoutMarker.adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_COLLISION',
    });

    const wrongMarker = memoryWorkspace({
      [managedAgentSkillMarkerPath(value.name)]: Buffer.from('{"artifactId":"other"}\n'),
    });
    await expect(installVerifiedAgentSkill(value, wrongMarker.adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_COLLISION',
    });
    expect(wrongMarker.files.size).toBe(1);
  });

  it('blocks digest tampering and rolls back a partial copy', async () => {
    const tampered = artifact();
    tampered.bundle[0]!.contentBase64 = Buffer.from('tampered').toString('base64');

    await expect(installVerifiedAgentSkill(tampered, memoryWorkspace().adapter)).rejects.toBeInstanceOf(
      AgentSkillArtifactError,
    );

    const valid = artifact();
    const workspace = memoryWorkspace();

    let count = 0;

    const failing: AgentSkillWorkspaceAdapter = {
      ...workspace.adapter,
      async writeFile(file) {
        count += 1;

        if (count === 3) {
          throw new Error('runtime unavailable');
        }

        return workspace.adapter.writeFile(file);
      },
    };
    await expect(installVerifiedAgentSkill(valid, failing)).rejects.toMatchObject({
      code: 'AGENT_SKILL_INSTALL_FAILED',
    });
    expect(workspace.files.size).toBe(0);
  });

  it('recovers an exact orphan marker and removes it after a safe retry failure', async () => {
    const value = artifact();
    const markerPath = managedAgentSkillMarkerPath(value.name);
    const workspace = memoryWorkspace({ [markerPath]: managedAgentSkillMarkerBytes(value) });
    const failing: AgentSkillWorkspaceAdapter = {
      ...workspace.adapter,
      async writeFile(file) {
        if (file.path.endsWith('/SKILL.md')) {
          throw new Error('runtime unavailable');
        }

        return workspace.adapter.writeFile(file);
      },
    };

    await expect(installVerifiedAgentSkill(value, failing)).rejects.toMatchObject({
      code: 'AGENT_SKILL_INSTALL_FAILED',
    });
    expect(workspace.files.size).toBe(0);
    expect(workspace.deletes).toEqual(['.agents/skills/review', markerPath]);
  });

  it('does not delete a concurrently replaced partial directory during rollback', async () => {
    const value = artifact();
    const markerPath = managedAgentSkillMarkerPath(value.name);
    const resourcePath = '.agents/skills/review/references/checklist.md';
    const workspace = memoryWorkspace();
    const failing: AgentSkillWorkspaceAdapter = {
      ...workspace.adapter,
      async writeFile(file) {
        if (file.path.endsWith('/SKILL.md')) {
          workspace.files.set(resourcePath, Buffer.from('concurrent replacement'));
          throw new Error('runtime unavailable');
        }

        return workspace.adapter.writeFile(file);
      },
    };

    await expect(installVerifiedAgentSkill(value, failing)).rejects.toMatchObject({
      code: 'AGENT_SKILL_INSTALL_FAILED',
    });
    expect(workspace.files.get(resourcePath)?.toString()).toBe('concurrent replacement');
    expect(workspace.files.get(markerPath)).toEqual(managedAgentSkillMarkerBytes(value));
    expect(workspace.deletes).toEqual([]);
  });

  it('rejects malformed provenance, non-canonical storage, and terminal audit states', async () => {
    const malformedSource = artifact();
    malformedSource.sourceUrl = 'https://github.com/example/skills/tree/main/skills/review';
    await expect(installVerifiedAgentSkill(malformedSource, memoryWorkspace().adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_ARTIFACT_CORRUPT',
    });

    const malformedBytes = artifact();
    malformedBytes.bundle[1]!.contentBase64 = `${malformedBytes.bundle[1]!.contentBase64}\n`;
    await expect(installVerifiedAgentSkill(malformedBytes, memoryWorkspace().adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_ARTIFACT_CORRUPT',
    });

    const misleadingMetadata = artifact();
    misleadingMetadata.description = 'Trusted by the platform.';
    await expect(installVerifiedAgentSkill(misleadingMetadata, memoryWorkspace().adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_AUDIT_BLOCKED',
    });

    const rejected = artifact();
    rejected.auditStatus = 'blocked';
    await expect(installVerifiedAgentSkill(rejected, memoryWorkspace().adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_AUDIT_BLOCKED',
    });

    const revoked = artifact();
    revoked.auditStatus = 'revoked';
    await expect(installVerifiedAgentSkill(revoked, memoryWorkspace().adapter)).rejects.toMatchObject({
      code: 'AGENT_SKILL_AUDIT_BLOCKED',
    });
  });

  it('removes an absent exact installation idempotently', async () => {
    await expect(removeAgentSkillInstallation(artifact(), memoryWorkspace().adapter)).resolves.toBe(
      '.agents/skills/review',
    );
  });
});

describe('Agent Skill state transition validation', () => {
  it.each([
    {
      action: 'approved' as const,
      expectedStatuses: ['quarantined'] as const,
      status: 'approved' as const,
      enabled: true,
      installedPath: '.agents/skills/review',
    },
    {
      action: 'rejected' as const,
      expectedStatuses: ['quarantined', 'blocked'] as const,
      status: 'blocked' as const,
      enabled: false,
    },
    {
      action: 'revoked' as const,
      expectedStatuses: ['approved'] as const,
      status: 'revoked' as const,
      enabled: false,
      installedPath: null,
    },
    {
      action: 'enabled' as const,
      expectedStatuses: ['approved'] as const,
      status: 'approved' as const,
      enabled: true,
      installedPath: '.agents/skills/review',
    },
    {
      action: 'disabled' as const,
      expectedStatuses: ['approved'] as const,
      status: 'approved' as const,
      enabled: false,
      installedPath: null,
    },
  ])('accepts the $action invariant', (transition) => {
    expect(() => validateAgentSkillArtifactTransition(transition)).not.toThrow();
  });

  it.each([
    {
      action: 'approved' as const,
      expectedStatuses: ['blocked'] as const,
      status: 'approved' as const,
      enabled: true,
      installedPath: '.agents/skills/review',
    },
    {
      action: 'enabled' as const,
      expectedStatuses: ['approved'] as const,
      status: 'approved' as const,
      enabled: false,
      installedPath: null,
    },
    {
      action: 'revoked' as const,
      expectedStatuses: ['approved'] as const,
      status: 'revoked' as const,
      enabled: true,
      installedPath: '.agents/skills/review',
    },
  ])('rejects an impossible $action combination', (transition) => {
    expect(() => validateAgentSkillArtifactTransition(transition)).toThrowError(
      expect.objectContaining({ code: 'AGENT_SKILL_STATE_INVALID' }),
    );
  });
});
