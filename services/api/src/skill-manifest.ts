/**
 * Interoperable Agent Skill manifest parser (RPL-SK-001.1 / .2).
 *
 * Implements the portable skill format standardized at
 * https://agentskills.io/specification : a skill is a directory
 * `.agents/skills/<name>/` containing a `SKILL.md` file whose YAML frontmatter
 * carries the two ALWAYS-loaded fields (`name`, `description`) and whose body is
 * the on-demand instructions. Sibling files (`references/`, `scripts/`,
 * `assets/`, …) are the third, load-on-request disclosure level.
 *
 * We deliberately DO NOT depend on a general YAML engine. The frontmatter of a
 * skill manifest is a tiny, well-defined subset (scalar `key: value`, block and
 * flow string lists, and a one-level `metadata:` map). A hand-written strict
 * reader lets us REJECT anything outside that subset — YAML anchors/aliases,
 * tabs, multi-document streams, deep nesting — which is a security posture
 * (untrusted third-party skills are parsed here), not a shortcut. Every rejection
 * is a typed error the auditor and API can surface.
 *
 * This module is PURE (no I/O) so it is fully unit-tested. `loadSkillFromFiles`
 * assembles a manifest from an in-memory file map; the workspace/materialization
 * and catalog-audit paths both feed it that map.
 */

/** The two frontmatter fields that live in context at all times (disclosure L1). */
export interface SkillFrontmatter {
  name: string;
  description: string;
  /** SPDX id or free text; optional. */
  license?: string;
  /** `allowed-tools` — optional allowlist of tool names the skill may use. */
  allowedTools: string[];
  /** `metadata:` — optional flat string map (version, author, homepage, …). */
  metadata: Record<string, string>;
}

export type SkillResourceKind = 'reference' | 'script' | 'asset' | 'other';

/** A bundled sibling file — disclosure level 3 (loaded only when requested). */
export interface SkillResourceRef {
  /** Skill-relative POSIX path, e.g. `references/api.md`. Never `SKILL.md`. */
  path: string;
  kind: SkillResourceKind;
  bytes: number;
}

/** A fully-parsed, validated skill. */
export interface SkillManifest extends SkillFrontmatter {
  /** Markdown body after the frontmatter — disclosure level 2. */
  body: string;
  /** Bundled sibling files — disclosure level 3. */
  resources: SkillResourceRef[];
  /** The verbatim SKILL.md text (frontmatter + body), for hashing/audit. */
  raw: string;
}

export type SkillParseResult =
  | { ok: true; manifest: SkillManifest }
  | { ok: false; errors: string[] };

/** Directory / manifest `name`: lowercase, digits, single hyphens, 1–64 chars. */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_NAME_LEN = 64;
export const MAX_DESCRIPTION_LEN = 1024;
/** Guard against a manifest that would blow up the context window on its own. */
export const MAX_BODY_LEN = 50_000;

const FRONTMATTER_FENCE = '---';

/** Classify a bundled resource by its top-level directory / extension. */
export function classifyResource(relPath: string): SkillResourceKind {
  const lower = relPath.toLowerCase();

  if (lower.startsWith('references/') || lower.startsWith('reference/')) {
    return 'reference';
  }

  if (lower.startsWith('scripts/') || /\.(sh|py|js|ts|rb|mjs|cjs)$/.test(lower)) {
    return 'script';
  }

  if (lower.startsWith('assets/') || /\.(png|jpg|jpeg|gif|svg|pdf|csv|json)$/.test(lower)) {
    return 'asset';
  }

  return 'other';
}

/**
 * Split a SKILL.md into its raw frontmatter block and body. Returns undefined if
 * the file does not open with a `---` fence on line 1 (frontmatter is REQUIRED).
 */
function splitFrontmatter(text: string): { yaml: string; body: string } | undefined {
  // Normalize newlines; the opening fence must be the very first line.
  const normalized = text.replace(/\r\n/g, '\n');

  if (!normalized.startsWith(`${FRONTMATTER_FENCE}\n`) && normalized.trimStart() !== normalized) {
    // Leading whitespace before the fence is not allowed.
    return undefined;
  }

  if (!normalized.startsWith(`${FRONTMATTER_FENCE}\n`)) {
    return undefined;
  }

  const rest = normalized.slice(FRONTMATTER_FENCE.length + 1);
  const closeIdx = rest.indexOf(`\n${FRONTMATTER_FENCE}`);

  if (closeIdx === -1) {
    return undefined;
  }

  const yaml = rest.slice(0, closeIdx);
  // Body begins after the closing fence line.
  const afterFence = rest.slice(closeIdx + 1 + FRONTMATTER_FENCE.length);

  return { yaml, body: afterFence.replace(/^\n/, '') };
}

/** Strip one layer of matching single/double quotes from a scalar. */
function unquote(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];

    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

/** Parse a flow list `[a, b, c]` of bare/quoted scalars. */
function parseFlowList(value: string): string[] {
  const inner = value.trim().slice(1, -1).trim();

  if (!inner) {
    return [];
  }

  return inner
    .split(',')
    .map((item) => unquote(item))
    .filter((item) => item.length > 0);
}

interface FrontmatterFields {
  scalars: Map<string, string>;
  lists: Map<string, string[]>;
  metadata: Record<string, string>;
  errors: string[];
}

/**
 * Strict, minimal frontmatter reader. Accepts only:
 *   key: scalar            (optionally quoted)
 *   key: [a, b]            (flow list)
 *   key:\n  - item          (block list, 2-space indent)
 *   metadata:\n  sub: val   (one-level map, 2-space indent)
 * Anything else (tabs, deeper nesting, YAML anchors, etc.) is an error.
 */
function readFrontmatter(yaml: string): FrontmatterFields {
  const scalars = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const metadata: Record<string, string> = {};
  const errors: string[] = [];

  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      i += 1;
      continue;
    }

    if (line.includes('\t')) {
      errors.push(`Frontmatter line ${i + 1}: tabs are not allowed.`);

      return { scalars, lists, metadata, errors };
    }

    // Top-level keys have no leading indent.
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);

    if (!match) {
      errors.push(`Frontmatter line ${i + 1}: expected "key: value", got ${JSON.stringify(line)}.`);

      return { scalars, lists, metadata, errors };
    }

    const key = match[1];
    const inlineRaw = match[2].trim();

    if (inlineRaw === '') {
      // Block form: either a `- item` list or (for metadata) a nested map.
      const block: string[] = [];
      let j = i + 1;

      while (j < lines.length && /^\s+\S/.test(lines[j])) {
        block.push(lines[j]);
        j += 1;
      }

      if (key === 'metadata') {
        for (const sub of block) {
          const subMatch = /^ {2}([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(sub);

          if (!subMatch) {
            errors.push(`Frontmatter metadata: only a flat 2-space map is allowed, got ${JSON.stringify(sub)}.`);

            return { scalars, lists, metadata, errors };
          }

          metadata[subMatch[1]] = unquote(subMatch[2]);
        }
      } else {
        for (const item of block) {
          const itemMatch = /^ {2}-\s+(.*)$/.exec(item);

          if (!itemMatch) {
            errors.push(`Frontmatter "${key}": only a 2-space block list is allowed, got ${JSON.stringify(item)}.`);

            return { scalars, lists, metadata, errors };
          }

          const parsed = unquote(itemMatch[1]);

          if (parsed) {
            (lists.get(key) ?? lists.set(key, []).get(key)!).push(parsed);
          }
        }

        if (!lists.has(key)) {
          lists.set(key, []);
        }
      }

      i = j;
      continue;
    }

    if (inlineRaw.startsWith('[') && inlineRaw.endsWith(']')) {
      lists.set(key, parseFlowList(inlineRaw));
      i += 1;
      continue;
    }

    scalars.set(key, unquote(inlineRaw));
    i += 1;
  }

  return { scalars, lists, metadata, errors };
}

/**
 * Parse a SKILL.md file's text into a validated frontmatter + body. Pure; does
 * not enumerate sibling resources (see `loadSkillFromFiles`). `expectedName`, if
 * given (the directory name), must equal the manifest `name` — the spec ties the
 * two together so a skill cannot lie about its own identity.
 */
export function parseSkillManifest(
  text: string,
  options: { expectedName?: string } = {},
): SkillParseResult {
  const errors: string[] = [];

  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, errors: ['SKILL.md is empty.'] };
  }

  const split = splitFrontmatter(text);

  if (!split) {
    return {
      ok: false,
      errors: ['SKILL.md must begin with a YAML frontmatter block delimited by "---" lines.'],
    };
  }

  const { scalars, lists, metadata, errors: fmErrors } = readFrontmatter(split.yaml);

  errors.push(...fmErrors);

  const name = scalars.get('name');
  const description = scalars.get('description');

  if (!name) {
    errors.push('Frontmatter is missing the required "name" field.');
  } else if (name.length > MAX_NAME_LEN) {
    errors.push(`"name" must be at most ${MAX_NAME_LEN} characters.`);
  } else if (!SKILL_NAME_RE.test(name)) {
    errors.push('"name" must be lowercase letters, digits, and single hyphens (e.g. "commit-helper").');
  }

  if (options.expectedName !== undefined && name && name !== options.expectedName) {
    errors.push(`"name" ("${name}") must match the skill directory name ("${options.expectedName}").`);
  }

  if (!description) {
    errors.push('Frontmatter is missing the required "description" field.');
  } else if (description.length > MAX_DESCRIPTION_LEN) {
    errors.push(`"description" must be at most ${MAX_DESCRIPTION_LEN} characters.`);
  }

  const body = split.body.trim();

  if (body === '') {
    errors.push('SKILL.md has no instructions body below the frontmatter.');
  } else if (body.length > MAX_BODY_LEN) {
    errors.push(`SKILL.md body must be at most ${MAX_BODY_LEN} characters.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const allowedTools = lists.get('allowed-tools') ?? lists.get('allowedTools') ?? [];
  const license = scalars.get('license');

  return {
    ok: true,
    manifest: {
      name: name!,
      description: description!,
      license,
      allowedTools,
      metadata,
      body,
      resources: [],
      raw: text.replace(/\r\n/g, '\n'),
    },
  };
}

/** A raw file in a skill directory: skill-relative path + its bytes. */
export interface SkillFileInput {
  path: string;
  content: string;
}

/**
 * Assemble a manifest from a skill directory's files (an in-memory map). The map
 * MUST contain `SKILL.md`; every other file becomes a disclosure-L3 resource.
 * `dirName` is the `<name>` segment used to enforce name↔directory equality.
 */
export function loadSkillFromFiles(dirName: string, files: readonly SkillFileInput[]): SkillParseResult {
  const manifestFile = files.find((file) => file.path === 'SKILL.md' || file.path.endsWith('/SKILL.md'));

  if (!manifestFile) {
    return { ok: false, errors: [`Skill "${dirName}" has no SKILL.md.`] };
  }

  const parsed = parseSkillManifest(manifestFile.content, { expectedName: dirName });

  if (!parsed.ok) {
    return parsed;
  }

  const resources: SkillResourceRef[] = files
    .filter((file) => file !== manifestFile)
    .map((file) => ({
      path: file.path,
      kind: classifyResource(file.path),
      bytes: Buffer.byteLength(file.content, 'utf8'),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return { ok: true, manifest: { ...parsed.manifest, resources } };
}
