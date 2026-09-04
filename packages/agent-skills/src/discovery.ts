import { MAX_SKILL_RESOURCE_CHARS, validateSkillResourcePath } from './path-policy.js';
import { parseAgentSkill } from './parse-skill.js';
import { scanAgentSkillSecurity } from './security.js';
import type {
  AgentSkillResource,
  DiscoveredAgentSkill,
  ParsedAgentSkillDocument,
  SkillAuditStatus,
  SkillCollision,
  SkillDiagnostic,
  SkillDiscoveryResult,
  SkillFileMap,
  SkillSecurityReport,
} from './types.js';

export const DEFAULT_PROJECT_ROOT = '/home/project';
export const MAX_RESOURCES_PER_SKILL = 256;

function normalizeProjectLocation(rawPath: string, projectRoot: string): string | undefined {
  if (!rawPath || rawPath.includes('\\') || rawPath.includes('\0')) return undefined;

  const normalizedRoot = projectRoot.replace(/\/$/, '');
  let path = rawPath;

  if (path.startsWith(`${normalizedRoot}/`)) {
    path = path.slice(normalizedRoot.length + 1);
  } else if (path.startsWith('/')) {
    return undefined;
  }

  return path.replace(/^\.\//, '');
}

function resourceEntries(
  files: SkillFileMap,
  rawLocations: ReadonlyMap<string, string>,
  skillRoot: string,
  diagnostics: SkillDiagnostic[],
): AgentSkillResource[] {
  const resources: AgentSkillResource[] = [];

  for (const [normalizedLocation, rawLocation] of rawLocations.entries()) {
    if (!normalizedLocation.startsWith(`${skillRoot}/`) || normalizedLocation === `${skillRoot}/SKILL.md`) continue;

    const entry = files[rawLocation];
    if (!entry || entry.type !== 'file') continue;
    const relative = normalizedLocation.slice(skillRoot.length + 1);
    const policy = validateSkillResourcePath(relative);

    if (!policy.ok) {
      diagnostics.push({
        code: policy.code,
        severity: 'warning',
        message: policy.reason,
        location: normalizedLocation,
      });
      continue;
    }

    if (resources.length >= MAX_RESOURCES_PER_SKILL) {
      diagnostics.push({
        code: 'skill.too-many-resources',
        severity: 'warning',
        message: `Only the first ${MAX_RESOURCES_PER_SKILL} resources are exposed.`,
        location: skillRoot,
      });
      break;
    }

    const content = entry.content ?? '';
    const tooLarge = content.length > MAX_SKILL_RESOURCE_CHARS;
    const size =
      typeof entry.size === 'number' && Number.isSafeInteger(entry.size) && entry.size >= 0 ? entry.size : content.length;

    if (tooLarge) {
      diagnostics.push({
        code: 'skill.resource-too-large',
        severity: 'warning',
        message: `Resource exceeds the ${MAX_SKILL_RESOURCE_CHARS}-character read limit.`,
        location: normalizedLocation,
      });
    }

    resources.push({
      path: policy.path,
      location: normalizedLocation,
      size,
      isBinary: entry.isBinary === true,
      ...(!entry.isBinary && !tooLarge ? { content } : {}),
    });
  }

  return resources.sort((a, b) => a.path.localeCompare(b.path));
}

export interface DiscoverProjectSkillsOptions {
  projectRoot?: string;
  resolveAuditStatus?: (input: {
    skill: ParsedAgentSkillDocument;
    security: SkillSecurityReport;
  }) => SkillAuditStatus;
}

/** Discover exact `.agents/skills/<name>/SKILL.md` entries from a project FileMap. */
export function discoverProjectSkills(
  files: SkillFileMap | undefined,
  options: DiscoverProjectSkillsOptions = {},
): SkillDiscoveryResult {
  if (!files) return { skills: [], diagnostics: [], collisions: [] };

  const projectRoot = options.projectRoot ?? DEFAULT_PROJECT_ROOT;
  const diagnostics: SkillDiagnostic[] = [];
  const collisions: SkillCollision[] = [];
  const rawLocations = new Map<string, string>();

  for (const rawPath of Object.keys(files).sort()) {
    const normalized = normalizeProjectLocation(rawPath, projectRoot);
    if (!normalized) continue;

    const previous = rawLocations.get(normalized);

    if (previous) {
      collisions.push({
        name: normalized,
        winner: previous,
        shadowed: rawPath,
        reason: 'duplicate-location',
      });
      diagnostics.push({
        code: 'skill.duplicate-location',
        severity: 'warning',
        message: `Duplicate FileMap representations resolve to ${normalized}; the first one wins.`,
        location: rawPath,
      });
      continue;
    }

    rawLocations.set(normalized, rawPath);
  }

  const candidates = [...rawLocations.entries()].filter(([location]) =>
    /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(location),
  );
  const discoveredByName = new Map<string, DiscoveredAgentSkill>();

  for (const [location, rawLocation] of candidates) {
    const entry = files[rawLocation];
    if (!entry || entry.type !== 'file' || entry.isBinary) {
      diagnostics.push({
        code: 'skill.instructions-not-text',
        severity: 'error',
        message: 'SKILL.md must be a UTF-8 text file.',
        location,
      });
      continue;
    }

    const directoryName = location.split('/').at(-2)!;
    const parsed = parseAgentSkill(entry.content ?? '', { directoryName, location });
    diagnostics.push(...parsed.diagnostics);
    if (!parsed.skill) continue;
    const resources = resourceEntries(files, rawLocations, parsed.skill.root, diagnostics);
    const security = scanAgentSkillSecurity({ ...parsed.skill, resources });
    const resolvedAuditStatus = options.resolveAuditStatus?.({ skill: parsed.skill, security }) ?? security.status;
    /* A persisted decision can approve reviewed medium-risk content, but it may
     * never override a fresh high/critical static finding in the current bytes. */
    const auditStatus =
      security.status === 'blocked' || security.status === 'quarantined' ? security.status : resolvedAuditStatus;
    const skill: DiscoveredAgentSkill = { ...parsed.skill, resources, security, auditStatus };
    const previous = discoveredByName.get(skill.metadata.name);

    if (previous) {
      collisions.push({
        name: skill.metadata.name,
        winner: previous.location,
        shadowed: skill.location,
        reason: 'duplicate-name',
      });
      diagnostics.push({
        code: 'skill.duplicate-name',
        severity: 'warning',
        message: `Skill "${skill.metadata.name}" is shadowed by ${previous.location}.`,
        location: skill.location,
      });
      continue;
    }

    discoveredByName.set(skill.metadata.name, skill);
  }

  const skills = [...discoveredByName.values()].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  return { skills, diagnostics, collisions };
}

export interface SkillScope {
  name: string;
  /** Larger number wins. Project scope should be greater than user/org/builtin. */
  priority: number;
  skills: readonly DiscoveredAgentSkill[];
}

/** Merge client scopes deterministically and report every shadowed skill name. */
export function mergeSkillScopes(scopes: readonly SkillScope[]): {
  skills: DiscoveredAgentSkill[];
  collisions: SkillCollision[];
} {
  const sortedScopes = [...scopes].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  const byName = new Map<string, { skill: DiscoveredAgentSkill; scope: string }>();
  const collisions: SkillCollision[] = [];

  for (const scope of sortedScopes) {
    for (const skill of [...scope.skills].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))) {
      const existing = byName.get(skill.metadata.name);

      if (existing) {
        collisions.push({
          name: skill.metadata.name,
          winner: `${existing.scope}:${existing.skill.location}`,
          shadowed: `${scope.name}:${skill.location}`,
          reason: 'scope-precedence',
        });
      } else {
        byName.set(skill.metadata.name, { skill, scope: scope.name });
      }
    }
  }

  return {
    skills: [...byName.values()].map(({ skill }) => skill).sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    collisions,
  };
}
