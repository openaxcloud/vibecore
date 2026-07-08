import { apiRequest } from '~/lib/enterprise-api.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('project-skills');

export interface ResolvedSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  source: string;
}

/** An installed GitHub-repo skill as the agent context needs it (F#27). */
export interface InstalledSkillForPrompt {
  ownerRepo: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  scope: string;
  homepageUrl?: string | null;
}

export interface ProjectSkillsContext {
  skills: ResolvedSkill[];
  installed: InstalledSkillForPrompt[];
  context: string;
}

/**
 * Build the system-prompt section for a project's ENABLED agent skills.
 * Exported separately so it can be unit-tested without a live API.
 */
export function formatSkillsContext(skills: ResolvedSkill[]): string {
  const lines = skills.map((skill) => `- ${skill.name} (${skill.category}): ${skill.description}`);

  return `<project_skills>
The user has ENABLED the following agent skills for this project. Treat each as an
active capability and apply it whenever it is relevant to the user's request — follow
its guidance and use it without being asked again. Skills not listed here are disabled;
do not apply them. The user manages this list from the IDE "Skills" panel.

${lines.join('\n')}
</project_skills>`;
}

/**
 * Build the system-prompt section for a project's ENABLED installed GitHub-repo
 * skills (F#27). Unlike builtin skills (which are a one-line capability hint),
 * each installed skill carries the full instructions fetched from its repo, so
 * they are emitted as their own blocks the agent must follow. Exported for unit
 * testing without a live API.
 */
export function formatInstalledSkillsContext(installed: InstalledSkillForPrompt[]): string {
  const blocks = installed.map((skill) => {
    const header = `### ${skill.name} (${skill.ownerRepo})`;

    return `${header}\n${skill.instructions.trim()}`;
  });

  return `<installed_skills>
The user has INSTALLED the following skills from GitHub repositories for this
project. Each block below is the skill's own instructions — treat them as active,
binding guidance and apply them whenever relevant, exactly like the builtin
skills. The user manages this list from the IDE "Skills" panel (Community tab).

${blocks.join('\n\n')}
</installed_skills>`;
}

/** Merge builtin + installed sections into the single system-prompt context. */
export function composeSkillsContext(
  builtin: ResolvedSkill[],
  installed: InstalledSkillForPrompt[],
): string | undefined {
  const sections: string[] = [];

  if (builtin.length) {
    sections.push(formatSkillsContext(builtin));
  }

  if (installed.length) {
    sections.push(formatInstalledSkillsContext(installed));
  }

  return sections.length ? sections.join('\n\n') : undefined;
}

/** De-duplicate installed skills by ownerRepo (project scope wins over workspace). */
function dedupeInstalled(rows: InstalledSkillForPrompt[]): InstalledSkillForPrompt[] {
  const byRepo = new Map<string, InstalledSkillForPrompt>();

  for (const row of rows) {
    if (!byRepo.has(row.ownerRepo)) {
      byRepo.set(row.ownerRepo, row);
    }
  }

  return [...byRepo.values()];
}

/**
 * Load the project's ENABLED agent skills and format them as a system-prompt
 * section. Enabling/disabling a skill in the IDE Skills panel changes what the
 * agent is told it can do — this is the consumption path that makes the toggles
 * functional (not just CRUD). Fails open to "no skills" so a registry hiccup
 * never blocks a generation.
 */
export async function retrieveSkillsForAgentContext(
  request: Request,
  input: { projectId?: string },
): Promise<ProjectSkillsContext | undefined> {
  if (!input.projectId) {
    return undefined;
  }

  const projectId = encodeURIComponent(input.projectId);

  // Builtin catalog skills (unchanged behaviour). Fail open per-source.
  const builtin = await apiRequest<{ skills?: ResolvedSkill[] }>(request, `/projects/${projectId}/skills`)
    .then((payload) => (payload.skills ?? []).filter((skill) => skill && skill.enabled))
    .catch((error) => {
      logger.warn('Project skills lookup skipped', error);
      return [] as ResolvedSkill[];
    });

  /*
   * Installed GitHub-repo skills, for BOTH the project and its workspace scope
   * (F#27). Each scope is fetched independently and fails open to [].
   */
  const fetchInstalled = (scope: 'project' | 'workspace') =>
    apiRequest<{ skills?: InstalledSkillForPrompt[] }>(
      request,
      `/projects/${projectId}/skills/installed?scope=${scope}`,
    )
      .then((payload) => (payload.skills ?? []).filter((skill) => skill && skill.enabled))
      .catch((error) => {
        logger.warn(`Installed skills lookup skipped (${scope})`, error);
        return [] as InstalledSkillForPrompt[];
      });

  const [projectInstalled, workspaceInstalled] = await Promise.all([
    fetchInstalled('project'),
    fetchInstalled('workspace'),
  ]);

  const installed = dedupeInstalled([...projectInstalled, ...workspaceInstalled]);

  const context = composeSkillsContext(builtin, installed);

  if (!context) {
    return undefined;
  }

  return { skills: builtin, installed, context };
}
