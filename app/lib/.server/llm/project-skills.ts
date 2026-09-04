import { createHash } from 'node:crypto';
import {
  AgentSkillRuntime,
  AgentSkillRuntimeError,
  buildAvailableSkillsCatalog,
  discoverProjectSkills,
  type DiscoveredAgentSkill,
  type DiscoverProjectSkillsOptions,
  type SkillCatalogEntry,
  type SkillCollision,
  type SkillDiagnostic,
} from '@vibecore/agent-skills';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { FileMap } from './constants';
import { apiRequest } from '~/lib/enterprise-api.server';

const AGENT_SKILLS_INTERNAL_DIRECTORY_RE = /(?:^|\/)\.agents\/(?:skills|\.vibecore)(?:\/|$)/;
const DEFAULT_PROJECT_ROOT = '/home/project';
const MANAGED_SKILL_MARKER_ROOT = '.agents/.vibecore/managed-skills';
const RUNTIME_SKILL_POLICY_MAX_TOTAL_FILES = 512;
const RUNTIME_SKILL_POLICY_MAX_TOTAL_BYTES = 10 * 1024 * 1024;

interface RuntimeSkillFileManifest {
  path: string;
  byteLength: number;
  sha256: string;
}

export interface RuntimeSkillPolicy {
  artifactId: string;
  projectId: string;
  workspaceKey: string;
  name: string;
  digest: string;
  auditStatus: 'quarantined' | 'blocked' | 'approved' | 'revoked';
  enabled: boolean;

  /** Present only for the one canonical approved+enabled artifact for this name. */
  files?: RuntimeSkillFileManifest[];
  marker?: RuntimeSkillFileManifest;
}

export type RuntimeSkillApproval = RuntimeSkillPolicy;

interface RuntimeSkillContextResponse {
  projectId?: string;
  workspaceKey?: string;
  runtimePolicies?: RuntimeSkillPolicy[];
  files?: FileMap;
}

interface RuntimeSkillScope {
  projectId: string;
  workspaceKey: string;
}

const runtimeSkillManifestSchema = z.object({
  path: z.string().min(1).max(1_024),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const runtimeSkillPolicyBaseSchema = z.object({
  artifactId: z.string().min(1).max(256),
  projectId: z.string().min(1).max(256),
  workspaceKey: z.string().min(1).max(256),
  name: z.string().min(1).max(64),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});

const runtimeSkillPolicySchema = z.discriminatedUnion('enabled', [
  runtimeSkillPolicyBaseSchema
    .extend({
      auditStatus: z.literal('approved'),
      enabled: z.literal(true),
      files: z.array(runtimeSkillManifestSchema).max(512),
      marker: runtimeSkillManifestSchema,
    })
    .strict(),
  runtimeSkillPolicyBaseSchema
    .extend({
      auditStatus: z.enum(['quarantined', 'blocked', 'approved', 'revoked']),
      enabled: z.literal(false),
    })
    .strict(),
]);

const runtimeSkillContextSchema = z
  .object({
    projectId: z.string().min(1).max(256),
    workspaceKey: z.string().min(1).max(256),
    runtimePolicies: z.array(runtimeSkillPolicySchema).max(512),
    files: z.record(
      z.string(),
      z.object({
        type: z.literal('file'),
        content: z.string(),
        isBinary: z.boolean(),
        size: z.number().int().nonnegative(),
      }),
    ),
  })
  .superRefine((context, refinement) => {
    let manifestFiles = 0;
    let manifestBytes = 0;

    for (const policy of context.runtimePolicies) {
      if (!policy.enabled) {
        continue;
      }

      manifestFiles += policy.files.length;
      manifestBytes += policy.marker.byteLength;

      for (const file of policy.files) {
        manifestBytes += file.byteLength;
      }

      if (
        manifestFiles > RUNTIME_SKILL_POLICY_MAX_TOTAL_FILES ||
        manifestBytes > RUNTIME_SKILL_POLICY_MAX_TOTAL_BYTES
      ) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Aggregate Agent Skill runtime policy limits exceeded.',
        });
        return;
      }
    }
  });

export interface ProjectSkillsContext {
  skills: DiscoveredAgentSkill[];
  entries: SkillCatalogEntry[];
  diagnostics: SkillDiagnostic[];
  collisions: SkillCollision[];

  /** Tier-one disclosure only: name, description, location. */
  context?: string;

  /** Server-held tier-two/tier-three loader. Its skill bodies never enter `context`. */
  runtime: AgentSkillRuntime;

  /** Auto-executing local tools for deliberate tier-two/tier-three disclosure. */
  tools: ToolSet;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AgentSkillRuntimeError('SKILL_TOOL_ABORTED', 'Skill loading was cancelled.');
  }
}

/** Tier-one prompt formatter. It can never serialize instructions or resources. */
export function formatSkillsContext(skills: readonly DiscoveredAgentSkill[]): string | undefined {
  return buildAvailableSkillsCatalog(skills).context;
}

/**
 * Create local AI SDK tools whose `execute` handlers keep disclosure server-side.
 * `allowed-tools` is returned as a declaration but never changes permissions.
 */
export function createProjectSkillTools(runtime: AgentSkillRuntime): ToolSet {
  const names = runtime.names;

  if (names.length === 0) {
    return {};
  }

  const nameSchema = z.enum(names as [string, ...string[]]);

  return {
    activate_skill: tool({
      description:
        'Load the full SKILL.md instructions for one relevant available skill. Activate only when its catalog description matches the task.',
      parameters: z.object({
        name: nameSchema.describe('Exact skill name from <available_skills>.'),
      }),
      execute: async ({ name }, { abortSignal }) => {
        throwIfAborted(abortSignal);

        return runtime.activate(name);
      },
    }),
    read_skill_resource: tool({
      description:
        'Read one text resource declared by a skill after activate_skill exposed its resource list. Paths stay confined to that skill.',
      parameters: z.object({
        name: nameSchema.describe('Exact name of an already activated skill.'),
        path: z.string().min(1).max(1_024).describe('Exact relative resource path returned by activate_skill.'),
      }),
      execute: async ({ name, path }, { abortSignal }) => {
        throwIfAborted(abortSignal);

        return runtime.readResource(name, path);
      },
    }),
  };
}

/** Local security-sensitive tools win a same-name collision with an MCP server. */
export function mergeProjectSkillTools(mcpTools: ToolSet, projectSkillTools: ToolSet): ToolSet {
  return { ...mcpTools, ...projectSkillTools };
}

/**
 * Skill bodies/resources are excluded from ordinary code-context selection.
 * Their only model-visible path is activate_skill/read_skill_resource.
 */
export function excludeAgentSkillFilesFromContext(files: FileMap | undefined): FileMap | undefined {
  if (!files) {
    return undefined;
  }

  const safeEntries = Object.entries(files).filter(([path]) => !AGENT_SKILLS_INTERNAL_DIRECTORY_RE.test(path));

  if (safeEntries.length === Object.keys(files).length) {
    return files;
  }

  return Object.fromEntries(safeEntries);
}

function normalizedProjectPath(rawPath: string): string | undefined {
  if (!rawPath || rawPath.includes('\\') || rawPath.includes('\0')) {
    return undefined;
  }

  if (rawPath.startsWith(`${DEFAULT_PROJECT_ROOT}/`)) {
    return rawPath.slice(DEFAULT_PROJECT_ROOT.length + 1);
  }

  if (rawPath.startsWith('/')) {
    return undefined;
  }

  return rawPath.replace(/^\.\//, '');
}

function fileBytes(entry: NonNullable<FileMap[string]> & { type: 'file' }): Buffer {
  return Buffer.from(entry.content, entry.isBinary ? 'base64' : 'utf8');
}

function managedSkillMarkerPath(name: string): string {
  return `${MANAGED_SKILL_MARKER_ROOT}/${name}.json`;
}

function normalizedFileEntry(files: FileMap, expectedPath: string): NonNullable<FileMap[string]> | undefined {
  const matches = Object.entries(files).filter(([rawPath]) => normalizedProjectPath(rawPath) === expectedPath);

  // Multiple aliases for one reserved path are ambiguous and therefore stale.
  return matches.length === 1 ? matches[0]?.[1] : undefined;
}

function hasManagedSkillMarker(files: FileMap, name: string): boolean {
  return normalizedFileEntry(files, managedSkillMarkerPath(name))?.type === 'file';
}

function managedSkillMarkerMatchesPolicy(files: FileMap, policy: RuntimeSkillPolicy): boolean {
  const entry = normalizedFileEntry(files, managedSkillMarkerPath(policy.name));

  if (!entry || entry.type !== 'file' || entry.isBinary) {
    return false;
  }

  try {
    const marker = JSON.parse(fileBytes(entry).toString('utf8')) as Record<string, unknown>;

    return (
      marker.version === 1 &&
      marker.artifactId === policy.artifactId &&
      marker.projectId === policy.projectId &&
      marker.workspaceKey === policy.workspaceKey &&
      marker.name === policy.name &&
      marker.digest === policy.digest
    );
  } catch {
    return false;
  }
}

function fileMatchesManifest(files: FileMap, manifest: RuntimeSkillFileManifest): boolean {
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.byteLength < 0) {
    return false;
  }

  const entry = normalizedFileEntry(files, manifest.path);

  if (!entry || entry.type !== 'file') {
    return false;
  }

  const bytes = fileBytes(entry);

  return (
    bytes.byteLength === manifest.byteLength && createHash('sha256').update(bytes).digest('hex') === manifest.sha256
  );
}

/** Exact installed-byte check binding a persisted approval to the current FileMap. */
export function runtimeApprovalMatchesSkill(
  files: FileMap,
  skill: Pick<DiscoveredAgentSkill, 'metadata' | 'root'>,
  approval: RuntimeSkillPolicy,
  scope?: RuntimeSkillScope,
): boolean {
  const expectedMarkerPath = managedSkillMarkerPath(skill.metadata.name);

  if (
    approval.name !== skill.metadata.name ||
    approval.auditStatus !== 'approved' ||
    !approval.enabled ||
    !approval.marker ||
    !approval.files ||
    (scope && (approval.projectId !== scope.projectId || approval.workspaceKey !== scope.workspaceKey)) ||
    !/^[a-f0-9]{64}$/.test(approval.digest) ||
    approval.marker.path !== expectedMarkerPath ||
    !fileMatchesManifest(files, approval.marker) ||
    !managedSkillMarkerMatchesPolicy(files, approval)
  ) {
    return false;
  }

  const current = Object.entries(files)
    .flatMap(([rawPath, entry]) => {
      if (!entry || entry.type !== 'file') {
        return [];
      }

      const path = normalizedProjectPath(rawPath);

      if (!path?.startsWith(`${skill.root}/`)) {
        return [];
      }

      const bytes = fileBytes(entry);

      return [
        {
          path: path.slice(skill.root.length + 1),
          byteLength: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      ];
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const expected = [...approval.files].sort((left, right) => left.path.localeCompare(right.path));

  return (
    current.length === expected.length &&
    current.every(
      (file, index) =>
        file.path === expected[index]?.path &&
        file.byteLength === expected[index]?.byteLength &&
        file.sha256 === expected[index]?.sha256,
    )
  );
}

export function runtimeApprovalResolver(
  files: FileMap,
  approvals: readonly RuntimeSkillPolicy[],
  scope?: RuntimeSkillScope,
): NonNullable<DiscoverProjectSkillsOptions['resolveAuditStatus']> {
  return ({ skill, security }) => {
    const candidates = approvals.filter((approval) => approval.name === skill.metadata.name);

    if (candidates.some((approval) => runtimeApprovalMatchesSkill(files, skill, approval, scope))) {
      return 'approved';
    }

    return candidates.length > 0 || hasManagedSkillMarker(files, skill.metadata.name) ? 'stale' : security.status;
  };
}

/** Pure FileMap-to-runtime composition used by the route and unit tests. */
export function createProjectSkillsContext(
  files: FileMap | undefined,
  options: DiscoverProjectSkillsOptions = {},
): ProjectSkillsContext {
  const discovery = discoverProjectSkills(files, options);
  const catalog = buildAvailableSkillsCatalog(discovery.skills);
  const runtime = new AgentSkillRuntime(discovery.skills);

  return {
    ...discovery,
    entries: catalog.entries,
    ...(catalog.context ? { context: catalog.context } : {}),
    runtime,
    tools: createProjectSkillTools(runtime),
  };
}

/**
 * Discover the open Agent Skills standard directly from the request's project
 * FileMap. No remote registry response or skill body is injected at startup.
 */
export async function retrieveSkillsForAgentContext(
  request: Request,
  input: {
    projectId?: string;
    workspaceId?: string;
    files?: FileMap;
    resolveAuditStatus?: DiscoverProjectSkillsOptions['resolveAuditStatus'];

    /** Test/embedded override; production resolves exact approved byte manifests from the API. */
    runtimeApprovals?: readonly RuntimeSkillPolicy[];
  },
): Promise<ProjectSkillsContext | undefined> {
  let files = input.files;
  let approvals = input.runtimeApprovals;
  let scope: RuntimeSkillScope | undefined;

  if (approvals === undefined && input.projectId && input.workspaceId) {
    try {
      const payload = await apiRequest<RuntimeSkillContextResponse>(
        request,
        `/projects/${encodeURIComponent(input.projectId)}/skills/runtime-context?workspaceId=${encodeURIComponent(input.workspaceId)}`,
        { redirectOn401: false, signal: request.signal },
      );

      const parsed = runtimeSkillContextSchema.safeParse(payload);

      if (!parsed.success || parsed.data.projectId !== input.projectId) {
        return undefined;
      }

      files = parsed.data.files;
      approvals = parsed.data.runtimePolicies;
      scope = { projectId: parsed.data.projectId, workspaceKey: parsed.data.workspaceKey };
    } catch {
      // Security policy and filesystem provenance are inseparable: no API, no Skills.
      return undefined;
    }
  } else if (approvals === undefined && (input.projectId || input.workspaceId)) {
    return undefined;
  }

  if (!files) {
    return undefined;
  }

  const hasManagedMarkers = Object.keys(files).some((path) =>
    /(?:^|\/)\.agents\/\.vibecore\/managed-skills\/[^/]+\.json$/.test(path),
  );
  const result = createProjectSkillsContext(files, {
    ...(input.resolveAuditStatus
      ? { resolveAuditStatus: input.resolveAuditStatus }
      : approvals || hasManagedMarkers
        ? { resolveAuditStatus: runtimeApprovalResolver(files, approvals ?? [], scope) }
        : {}),
  });

  return result.skills.length > 0 || result.diagnostics.length > 0 ? result : undefined;
}
