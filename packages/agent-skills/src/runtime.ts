import { resolveSkillResourceLocation, validateSkillResourcePath } from './path-policy.js';
import { DEFAULT_RUNTIME_SKILL_STATUSES } from './prompt.js';
import type {
  DiscoveredAgentSkill,
  SkillActivationPayload,
  SkillAuditStatus,
  SkillResourcePayload,
} from './types.js';

export class AgentSkillRuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentSkillRuntimeError';
    this.code = code;
  }
}

export class AgentSkillRuntime {
  readonly #skills = new Map<string, DiscoveredAgentSkill>();
  readonly #activated = new Set<string>();

  constructor(
    skills: readonly DiscoveredAgentSkill[],
    allowedStatuses: readonly SkillAuditStatus[] = DEFAULT_RUNTIME_SKILL_STATUSES,
  ) {
    const allowed = new Set(allowedStatuses);

    for (const skill of skills) {
      if (allowed.has(skill.auditStatus)) this.#skills.set(skill.metadata.name, skill);
    }
  }

  get names(): string[] {
    return [...this.#skills.keys()].sort();
  }

  get size(): number {
    return this.#skills.size;
  }

  activate(name: string): SkillActivationPayload {
    const skill = this.#skills.get(name);

    if (!skill) {
      throw new AgentSkillRuntimeError('SKILL_NOT_AVAILABLE', `Skill "${name}" is not available in this context.`);
    }

    const alreadyActivated = this.#activated.has(name);
    this.#activated.add(name);

    /* Each explicit call rehydrates the current model segment. This matters for
     * auto-continuations, whose provider context does not retain prior tool
     * results. `alreadyActivated` remains available for telemetry/UI dedupe. */
    return {
      name,
      description: skill.metadata.description,
      instructions: skill.body,
      directory: skill.root,
      resources: skill.resources.map(({ path, size, isBinary }) => ({ path, size, isBinary })),
      ...(skill.metadata.allowedTools ? { declaredAllowedTools: skill.metadata.allowedTools } : {}),
      grantsToolPermissions: false,
      alreadyActivated,
    };
  }

  readResource(name: string, requestedPath: string): SkillResourcePayload {
    const skill = this.#skills.get(name);

    if (!skill) {
      throw new AgentSkillRuntimeError('SKILL_NOT_AVAILABLE', `Skill "${name}" is not available in this context.`);
    }

    if (!this.#activated.has(name)) {
      throw new AgentSkillRuntimeError('SKILL_NOT_ACTIVATED', `Activate skill "${name}" before reading its resources.`);
    }

    const validated = validateSkillResourcePath(requestedPath);

    if (!validated.ok) throw new AgentSkillRuntimeError(validated.code, validated.reason);
    const location = resolveSkillResourceLocation(skill.root, validated.path);

    if (!location.ok) throw new AgentSkillRuntimeError(location.code, location.reason);
    const resource = skill.resources.find((candidate) => candidate.path === validated.path);

    if (!resource || resource.location !== location.path) {
      throw new AgentSkillRuntimeError('SKILL_RESOURCE_NOT_FOUND', `Resource "${validated.path}" does not exist.`);
    }

    if (resource.isBinary) {
      throw new AgentSkillRuntimeError('SKILL_RESOURCE_BINARY', 'Binary skill resources cannot be loaded into context.');
    }

    if (resource.content === undefined) {
      throw new AgentSkillRuntimeError('SKILL_RESOURCE_TOO_LARGE', 'Skill resource exceeds the context read limit.');
    }

    return { skill: name, path: resource.path, content: resource.content, size: resource.size };
  }
}
