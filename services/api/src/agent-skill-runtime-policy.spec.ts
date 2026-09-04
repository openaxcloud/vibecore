import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_SKILL_RUNTIME_POLICY_MAX_NAMES,
  AGENT_SKILL_RUNTIME_POLICY_MAX_RECORDS,
  buildAgentSkillRuntimePolicies,
} from './agent-skill-runtime-policy.js';
import { managedAgentSkillMarkerManifest } from './agent-skill-artifact-service.js';
import type {
  AgentSkillArtifactStatus,
  AgentSkillArtifactWithBundleRecord,
  AgentSkillRuntimePolicyRecord,
} from './store.js';

const projectId = 'project_1';
const workspaceKey = 'workspace_1';

function record(
  id: string,
  name: string,
  auditStatus: AgentSkillArtifactStatus,
  enabled: boolean,
  updatedAt = '2026-07-15T12:00:00.000Z',
): AgentSkillRuntimePolicyRecord {
  return {
    id,
    projectId,
    workspaceKey,
    name,
    digest: 'd'.repeat(64),
    commitSha: 'a'.repeat(40),
    auditStatus,
    enabled,
    updatedAt,
  };
}

function artifact(policy: AgentSkillRuntimePolicyRecord): AgentSkillArtifactWithBundleRecord {
  const skillMarkdown = `---\nname: ${policy.name}\ndescription: Review changes safely.\n---\n`;

  return {
    id: policy.id,
    projectId: policy.projectId,
    workspaceKey: policy.workspaceKey,
    ownerRepo: 'example/skills',
    skillPath: `skills/${policy.name}`,
    requestedRef: 'main',
    commitSha: policy.commitSha,
    digest: policy.digest,
    sourceUrl: `https://github.com/example/skills/tree/${policy.commitSha}/skills/${policy.name}`,
    name: policy.name,
    description: 'Review changes safely.',
    auditStatus: policy.auditStatus,
    auditReport: {},
    enabled: policy.enabled,
    installedPath: `.agents/skills/${policy.name}`,
    createdAt: '2026-07-15T10:00:00.000Z',
    updatedAt: policy.updatedAt,
    bundle: [
      {
        path: 'SKILL.md',
        contentBase64: Buffer.from(skillMarkdown).toString('base64'),
        byteLength: Buffer.byteLength(skillMarkdown),
        mode: '100644',
      },
    ],
  };
}

describe('Agent Skill runtime policy materialization', () => {
  it('aggregates canonically by name and loads bundles only for approved+enabled records', async () => {
    const active = record('artifact_active', 'beta', 'approved', true, '2026-07-15T10:00:00.000Z');
    const loadArtifact = vi.fn(async (artifactId: string) =>
      artifactId === active.id ? artifact(active) : undefined,
    );
    const policies = await buildAgentSkillRuntimePolicies({
      projectId,
      workspaceKey,
      records: [
        record('artifact_alpha_old', 'alpha', 'quarantined', false, '2026-07-15T08:00:00.000Z'),
        record('artifact_alpha_latest', 'alpha', 'revoked', false, '2026-07-15T12:00:00.000Z'),
        record('artifact_beta_tombstone', 'beta', 'revoked', false, '2026-07-15T11:00:00.000Z'),
        active,
      ],
      loadArtifact,
    });

    expect(loadArtifact).toHaveBeenCalledTimes(1);
    expect(loadArtifact).toHaveBeenCalledWith(active.id);
    expect(policies).toHaveLength(2);
    expect(policies[0]).toEqual({
      artifactId: 'artifact_alpha_latest',
      projectId,
      workspaceKey,
      name: 'alpha',
      digest: 'd'.repeat(64),
      auditStatus: 'revoked',
      enabled: false,
    });
    expect(policies[1]).toMatchObject({
      artifactId: active.id,
      name: 'beta',
      auditStatus: 'approved',
      enabled: true,
      marker: expect.objectContaining({ path: '.agents/.vibecore/managed-skills/beta.json' }),
      files: [expect.objectContaining({ path: 'SKILL.md', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })],
    });
  });

  it('compacts the maximum tombstone history without one bundle lookup', async () => {
    const loadArtifact = vi.fn();
    const records = Array.from({ length: AGENT_SKILL_RUNTIME_POLICY_MAX_RECORDS }, (_, index) =>
      record(
        `artifact_${String(index).padStart(4, '0')}`,
        'one-name',
        index % 2 === 0 ? 'blocked' : 'revoked',
        false,
        new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      ),
    );

    const policies = await buildAgentSkillRuntimePolicies({ projectId, workspaceKey, records, loadArtifact });

    expect(loadArtifact).not.toHaveBeenCalled();
    expect(policies).toHaveLength(1);
    expect(policies[0]).not.toHaveProperty('files');
    expect(policies[0]).not.toHaveProperty('marker');
  });

  it('fails closed when record or distinct-name bounds are exceeded', async () => {
    const loadArtifact = vi.fn();
    const tooManyRecords = Array.from({ length: AGENT_SKILL_RUNTIME_POLICY_MAX_RECORDS + 1 }, (_, index) =>
      record(`artifact_${index}`, 'one-name', 'revoked', false),
    );

    await expect(
      buildAgentSkillRuntimePolicies({ projectId, workspaceKey, records: tooManyRecords, loadArtifact }),
    ).rejects.toMatchObject({
      code: 'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE',
      statusCode: 413,
    });

    const tooManyNames = Array.from({ length: AGENT_SKILL_RUNTIME_POLICY_MAX_NAMES + 1 }, (_, index) =>
      record(`artifact_name_${index}`, `skill-${index}`, 'quarantined', false),
    );
    await expect(
      buildAgentSkillRuntimePolicies({ projectId, workspaceKey, records: tooManyNames, loadArtifact }),
    ).rejects.toMatchObject({
      code: 'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE',
      statusCode: 413,
    });
    expect(loadArtifact).not.toHaveBeenCalled();
  });

  it('fails closed on conflicting active rows before loading either bundle', async () => {
    const loadArtifact = vi.fn();
    const records = [
      record('artifact_active_1', 'safe-review', 'approved', true),
      record('artifact_active_2', 'safe-review', 'approved', true),
    ];

    await expect(
      buildAgentSkillRuntimePolicies({ projectId, workspaceKey, records, loadArtifact }),
    ).rejects.toMatchObject({
      code: 'AGENT_SKILL_RUNTIME_POLICY_CONFLICT',
      statusCode: 409,
    });
    expect(loadArtifact).not.toHaveBeenCalled();
  });

  it('fails closed on aggregate active bytes before loading later bundles', async () => {
    const active = [
      record('artifact_alpha', 'alpha', 'approved', true),
      record('artifact_beta', 'beta', 'approved', true),
      record('artifact_gamma', 'gamma', 'approved', true),
    ];
    const artifacts = new Map(active.map((policy) => [policy.id, artifact(policy)]));
    const firstArtifact = artifacts.get('artifact_alpha')!;
    const firstBytes =
      managedAgentSkillMarkerManifest(firstArtifact).byteLength +
      firstArtifact.bundle.reduce((total, file) => total + file.byteLength, 0);
    const loadArtifact = vi.fn(async (artifactId: string) => artifacts.get(artifactId));

    await expect(
      buildAgentSkillRuntimePolicies({
        projectId,
        workspaceKey,
        records: active,
        loadArtifact,
        maxTotalBytes: firstBytes + 1,
      }),
    ).rejects.toMatchObject({ code: 'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE', statusCode: 413 });
    expect(loadArtifact).toHaveBeenCalledTimes(2);
    expect(loadArtifact).not.toHaveBeenCalledWith('artifact_gamma');
  });

  it('fails closed on aggregate active manifest count', async () => {
    const active = [
      record('artifact_alpha', 'alpha', 'approved', true),
      record('artifact_beta', 'beta', 'approved', true),
    ];
    const artifacts = new Map(active.map((policy) => [policy.id, artifact(policy)]));
    const loadArtifact = vi.fn(async (artifactId: string) => artifacts.get(artifactId));

    await expect(
      buildAgentSkillRuntimePolicies({
        projectId,
        workspaceKey,
        records: active,
        loadArtifact,
        maxTotalManifestFiles: 1,
      }),
    ).rejects.toMatchObject({ code: 'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE', statusCode: 413 });
    expect(loadArtifact).toHaveBeenCalledTimes(2);
  });
});
