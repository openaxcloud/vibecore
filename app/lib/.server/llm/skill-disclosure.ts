/**
 * Progressive disclosure for installed Agent Skills in the LIVE agent-context path
 * (RPL-SK-001.2). agentskills.io loads a skill in three levels so a large skill
 * library costs almost nothing until a skill is actually relevant:
 *
 *   L1 — name + description. ALWAYS in context (one line per skill).
 *   L2 — the skill body/instructions. Loaded ONLY when the skill is triggered by
 *        the current request.
 *   L3 — a bundled resource. Loaded ONLY when that specific file is requested.
 *
 * Laziness is a mechanism, not a claim: L2/L3 come from `loadBody` / `loadResource`
 * callbacks this session invokes AT MOST ONCE, on first open. Every load appends to
 * an ordered `trace`; a trace showing L1 for every skill but L2 only for the
 * triggered ones is a machine-checkable proof that irrelevant bodies were not
 * pulled into the prompt.
 *
 * This is the runtime twin of `services/api/src/skill-disclosure.ts` (same design,
 * unit-tested there + here). It lives app-side because the agent context is built
 * in the Remix server (`project-skills.ts`), which cannot import the API service.
 */

export type DisclosureLevel = 1 | 2 | 3;

export interface DisclosureTraceEntry {
  seq: number;
  level: DisclosureLevel;
  skill: string;
  resource?: string;
  bytes: number;
  at: string;
}

export interface DisclosureResourceSpec {
  path: string;
  bytes: number;
}

export interface DisclosureSkillSpec {
  name: string;
  description: string;
  resources: DisclosureResourceSpec[];
  loadBody: () => string;
  loadResource: (path: string) => string;
}

const utf8Bytes = (text: string): number =>
  typeof Buffer !== 'undefined' ? Buffer.byteLength(text, 'utf8') : text.length;

/** A single agent turn's disclosure session over a set of installed skills. */
export class SkillDisclosureSession {
  readonly #skills: Map<string, DisclosureSkillSpec>;
  readonly #clock: () => string;
  readonly #trace: DisclosureTraceEntry[] = [];
  readonly #bodyCache = new Map<string, string>();
  readonly #resourceCache = new Map<string, string>();
  #manifestEmitted = false;
  #seq = 0;

  constructor(skills: readonly DisclosureSkillSpec[], clock: () => string) {
    this.#skills = new Map(skills.map((skill) => [skill.name, skill]));
    this.#clock = clock;
  }

  get skillNames(): string[] {
    return [...this.#skills.keys()];
  }

  #record(level: DisclosureLevel, skill: string, bytes: number, resource?: string): void {
    this.#seq += 1;
    this.#trace.push({ seq: this.#seq, level, skill, resource, bytes, at: this.#clock() });
  }

  /** The always-in-context L1 block: one `- name: description` line per skill. */
  contextManifest(): string {
    const lines = [...this.#skills.values()].map((skill) => `- ${skill.name}: ${skill.description}`);
    const block = `<available_skills>\n${lines.join('\n')}\n</available_skills>`;

    if (!this.#manifestEmitted) {
      this.#manifestEmitted = true;

      for (const skill of this.#skills.values()) {
        this.#record(1, skill.name, utf8Bytes(`${skill.name}: ${skill.description}`));
      }
    }

    return block;
  }

  /** Open a skill's L2 body. Loads (via `loadBody`) at most once. */
  open(skillName: string): string {
    const skill = this.#skills.get(skillName);

    if (!skill) {
      throw new Error(`Unknown skill "${skillName}".`);
    }

    const cached = this.#bodyCache.get(skillName);

    if (cached !== undefined) {
      return cached;
    }

    const body = skill.loadBody();

    this.#bodyCache.set(skillName, body);
    this.#record(2, skillName, utf8Bytes(body));

    return body;
  }

  /** Open a specific L3 resource. Rejects a path the skill did not declare. */
  openResource(skillName: string, resourcePath: string): string {
    const skill = this.#skills.get(skillName);

    if (!skill) {
      throw new Error(`Unknown skill "${skillName}".`);
    }

    if (!skill.resources.some((resource) => resource.path === resourcePath)) {
      throw new Error(`Skill "${skillName}" declares no resource "${resourcePath}".`);
    }

    const cacheKey = `${skillName} ${resourcePath}`;
    const cached = this.#resourceCache.get(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    const content = skill.loadResource(resourcePath);

    this.#resourceCache.set(cacheKey, content);
    this.#record(3, skillName, utf8Bytes(content), resourcePath);

    return content;
  }

  trace(): DisclosureTraceEntry[] {
    return this.#trace.map((entry) => ({ ...entry }));
  }

  bytesByLevel(): Record<DisclosureLevel, number> {
    const totals: Record<DisclosureLevel, number> = { 1: 0, 2: 0, 3: 0 };

    for (const entry of this.#trace) {
      totals[entry.level] += entry.bytes;
    }

    return totals;
  }
}

/** Minimal shape the disclosure needs from an installed skill. */
export interface DisclosableSkill {
  ownerRepo: string;
  name: string;
  description: string;
  instructions: string;
  manifestName?: string | null;
  resources?: Array<{ path: string; bytes: number }>;
}

export interface SkillDisclosureResult {
  /** The system-prompt section: L1 manifest for all + L2 bodies for triggered skills. */
  context: string;
  trace: DisclosureTraceEntry[];

  /** ownerRepo of skills whose body (L2) was loaded this turn. */
  triggered: string[];
  bytesByLevel: Record<DisclosureLevel, number>;
}

/** Common English words ignored during relevance matching (reduce over-triggering). */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'your',
  'you',
  'this',
  'that',
  'from',
  'into',
  'when',
  'what',
  'which',
  'their',
  'them',
  'they',
  'use',
  'used',
  'using',
  'code',
  'file',
  'files',
  'project',
  'agent',
  'skill',
  'skills',
  'help',
  'apply',
  'about',
]);

/**
 * Terms a skill's L1 (name + description + manifest + repo) contributes to relevance
 * matching — lowercased, ≥4 chars, minus common stop words. A skill's body (L2) is
 * loaded only when the request mentions one of these, so the description's "when to
 * use" text (agentskills.io) drives disclosure.
 */
function relevanceTerms(skill: DisclosableSkill): string[] {
  const raw =
    `${skill.name} ${skill.manifestName ?? ''} ${skill.ownerRepo.split('/')[1] ?? ''} ${skill.description}`.toLowerCase();

  return [...new Set(raw.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOP_WORDS.has(word)))];
}

/**
 * Decide whether a skill is triggered by the current request. A skill is relevant
 * when the user's prompt mentions one of its identity terms. When there is no
 * prompt to assess (undefined), every skill is triggered — the agent still gets
 * full guidance rather than silently losing a capability.
 */
export function isSkillTriggered(skill: DisclosableSkill, userPrompt: string | undefined): boolean {
  if (userPrompt === undefined) {
    return true;
  }

  const haystack = userPrompt.toLowerCase();

  return relevanceTerms(skill).some((term) => haystack.includes(term));
}

/**
 * Build the installed-skills system-prompt section with progressive disclosure.
 * L1 (name+description) is emitted for every skill; L2 (body) is opened ONLY for
 * skills triggered by `userPrompt`. Returns the composed context plus the ordered
 * trace proving which levels were loaded. `clock` is injectable for deterministic
 * tests; production passes `() => new Date().toISOString()`.
 */
export function discloseInstalledSkills(
  installed: readonly DisclosableSkill[],
  userPrompt: string | undefined,
  clock: () => string = () => new Date().toISOString(),
): SkillDisclosureResult {
  if (installed.length === 0) {
    return { context: '', trace: [], triggered: [], bytesByLevel: { 1: 0, 2: 0, 3: 0 } };
  }

  const byName = new Map<string, DisclosableSkill>();

  const specs: DisclosureSkillSpec[] = installed.map((skill) => {
    // Disambiguate skills that share a name by suffixing the repo owner.
    const key = byName.has(skill.name) ? `${skill.name} (${skill.ownerRepo})` : skill.name;
    byName.set(key, skill);

    return {
      name: key,
      description: skill.description,
      resources: (skill.resources ?? []).map((resource) => ({ path: resource.path, bytes: resource.bytes })),
      loadBody: () => skill.instructions.trim(),
      loadResource: (path: string) => {
        const match = (skill.resources ?? []).find((resource) => resource.path === path);

        return match ? `(resource ${path}, ${match.bytes} bytes — fetch on demand)` : '';
      },
    };
  });

  const session = new SkillDisclosureSession(specs, clock);
  const manifest = session.contextManifest();

  const triggered: string[] = [];
  const bodyBlocks: string[] = [];

  for (const [key, skill] of byName) {
    if (isSkillTriggered(skill, userPrompt)) {
      const body = session.open(key);
      triggered.push(skill.ownerRepo);
      bodyBlocks.push(`### ${skill.name} (${skill.ownerRepo})\n${body}`);
    }
  }

  const sections = [
    `<installed_skills>`,
    `The user has INSTALLED the following skills. The <available_skills> list is always`,
    `present so you know what exists; a skill's full instructions are loaded below only`,
    `when it is relevant to the current request (progressive disclosure). Apply the`,
    `active skills' instructions as binding guidance.`,
    ``,
    manifest,
    ...(bodyBlocks.length ? ['', '<active_skills>', bodyBlocks.join('\n\n'), '</active_skills>'] : []),
    `</installed_skills>`,
  ].join('\n');

  return { context: sections, trace: session.trace(), triggered, bytesByLevel: session.bytesByLevel() };
}
