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

export interface ProjectSkillsContext {
  skills: ResolvedSkill[];
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

  try {
    const payload = await apiRequest<{ skills?: ResolvedSkill[] }>(
      request,
      `/projects/${encodeURIComponent(input.projectId)}/skills`,
    );

    const enabled = (payload.skills ?? []).filter((skill) => skill && skill.enabled);

    if (!enabled.length) {
      return undefined;
    }

    return { skills: enabled, context: formatSkillsContext(enabled) };
  } catch (error) {
    logger.warn('Project skills lookup skipped', error);
    return undefined;
  }
}
