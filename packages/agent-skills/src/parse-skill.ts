import { parseDocument, visit } from 'yaml';

import type {
  AgentSkillMetadata,
  ParsedAgentSkillDocument,
  SkillDiagnostic,
  SkillParseResult,
} from './types.js';

export const MAX_SKILL_MD_CHARS = 200_000;
export const RECOMMENDED_SKILL_MD_LINES = 500;
export const RECOMMENDED_INSTRUCTION_TOKENS = 5_000;

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KNOWN_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

function error(code: string, message: string, location?: string): SkillDiagnostic {
  return { code, severity: 'error', message, location };
}

function warning(code: string, message: string, location?: string): SkillDiagnostic {
  return { code, severity: 'warning', message, location };
}

function stringField(
  frontmatter: Map<unknown, unknown>,
  field: string,
  diagnostics: SkillDiagnostic[],
  location: string,
  options: { required?: boolean; max?: number } = {},
): string | undefined {
  const value = frontmatter.get(field);

  if (value === undefined || value === null) {
    if (options.required) {
      diagnostics.push(error('frontmatter.missing-field', `Required frontmatter field "${field}" is missing.`, location));
    }

    return undefined;
  }

  if (typeof value !== 'string') {
    diagnostics.push(error('frontmatter.invalid-type', `Frontmatter field "${field}" must be a string.`, location));
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    diagnostics.push(error('frontmatter.empty-field', `Frontmatter field "${field}" must not be empty.`, location));
    return undefined;
  }

  if (options.max !== undefined && trimmed.length > options.max) {
    diagnostics.push(
      error(
        'frontmatter.field-too-long',
        `Frontmatter field "${field}" exceeds the ${options.max}-character limit.`,
        location,
      ),
    );
    return undefined;
  }

  return trimmed;
}

function metadataField(
  frontmatter: Map<unknown, unknown>,
  diagnostics: SkillDiagnostic[],
  location: string,
): Readonly<Record<string, string>> | undefined {
  const value = frontmatter.get('metadata');

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!(value instanceof Map)) {
    diagnostics.push(error('frontmatter.invalid-metadata', 'Frontmatter field "metadata" must be a mapping.', location));
    return undefined;
  }

  const result: Record<string, string> = Object.create(null) as Record<string, string>;

  for (const [key, item] of value.entries()) {
    if (typeof key !== 'string' || typeof item !== 'string') {
      diagnostics.push(
        error('frontmatter.invalid-metadata-entry', 'Every metadata key and value must be a string.', location),
      );
      continue;
    }

    result[key] = item;
  }

  return Object.keys(result).length > 0 ? Object.freeze({ ...result }) : undefined;
}

function skillRoot(location: string): string {
  return location.endsWith('/SKILL.md') ? location.slice(0, -'/SKILL.md'.length) : location;
}

export interface ParseAgentSkillOptions {
  directoryName: string;
  location: string;
  maxCharacters?: number;
}

/** Parse one exact SKILL.md using a non-executable YAML 1.2 schema. */
export function parseAgentSkill(source: string, options: ParseAgentSkillOptions): SkillParseResult {
  const diagnostics: SkillDiagnostic[] = [];
  const maxCharacters = options.maxCharacters ?? MAX_SKILL_MD_CHARS;

  if (typeof source !== 'string') {
    return { diagnostics: [error('skill.invalid-source', 'SKILL.md content must be text.', options.location)] };
  }

  if (source.length > maxCharacters) {
    return {
      diagnostics: [
        error('skill.file-too-large', `SKILL.md exceeds the ${maxCharacters}-character safety limit.`, options.location),
      ],
    };
  }

  const normalized = source.startsWith('\uFEFF') ? source.slice(1) : source;
  const lines = normalized.split(/\r?\n/);

  if (lines[0] !== '---') {
    return {
      diagnostics: [
        error('frontmatter.missing-opening-delimiter', 'SKILL.md must start with an exact "---" line.', options.location),
      ],
    };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');

  if (closingIndex < 0) {
    return {
      diagnostics: [
        error('frontmatter.missing-closing-delimiter', 'SKILL.md frontmatter is missing its closing "---".', options.location),
      ],
    };
  }

  const yamlSource = lines.slice(1, closingIndex).join('\n');
  const document = parseDocument(yamlSource, {
    customTags: [],
    merge: false,
    prettyErrors: false,
    resolveKnownTags: false,
    schema: 'core',
    strict: true,
    stringKeys: true,
    uniqueKeys: true,
    version: '1.2',
  });

  for (const parseError of document.errors) {
    diagnostics.push(error('frontmatter.invalid-yaml', parseError.message, options.location));
  }

  for (const parseWarning of document.warnings) {
    diagnostics.push(error('frontmatter.unsafe-yaml', parseWarning.message, options.location));
  }

  let containsAlias = false;
  let containsAnchor = false;

  visit(document, {
    Alias() {
      containsAlias = true;
    },
    Node(_key, node) {
      if ('anchor' in node && typeof node.anchor === 'string' && node.anchor.length > 0) {
        containsAnchor = true;
      }
    },
  });

  if (containsAlias || containsAnchor) {
    diagnostics.push(
      error(
        'frontmatter.anchors-forbidden',
        'YAML anchors and aliases are not accepted in skill metadata.',
        options.location,
      ),
    );
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { diagnostics };
  }

  let frontmatter: unknown;

  try {
    frontmatter = document.toJS({ mapAsMap: true, maxAliasCount: 0 });
  } catch (cause) {
    diagnostics.push(
      error(
        'frontmatter.conversion-failed',
        cause instanceof Error ? cause.message : 'Unable to convert YAML frontmatter.',
        options.location,
      ),
    );
    return { diagnostics };
  }

  if (!(frontmatter instanceof Map)) {
    return {
      diagnostics: [
        ...diagnostics,
        error('frontmatter.invalid-root', 'SKILL.md frontmatter must be a YAML mapping.', options.location),
      ],
    };
  }

  for (const key of frontmatter.keys()) {
    if (typeof key !== 'string') {
      diagnostics.push(error('frontmatter.invalid-key', 'Frontmatter keys must be strings.', options.location));
    } else if (!KNOWN_FIELDS.has(key)) {
      diagnostics.push(
        warning('frontmatter.unknown-field', `Unknown frontmatter field "${key}" is ignored.`, options.location),
      );
    }
  }

  const name = stringField(frontmatter, 'name', diagnostics, options.location, { required: true, max: 64 });
  const description = stringField(frontmatter, 'description', diagnostics, options.location, {
    required: true,
    max: 1024,
  });
  const license = stringField(frontmatter, 'license', diagnostics, options.location);
  const compatibility = stringField(frontmatter, 'compatibility', diagnostics, options.location, { max: 500 });
  const allowedTools = stringField(frontmatter, 'allowed-tools', diagnostics, options.location);
  const metadata = metadataField(frontmatter, diagnostics, options.location);

  if (name && !SKILL_NAME_RE.test(name)) {
    diagnostics.push(
      error(
        'frontmatter.invalid-name',
        'Skill name must contain only lowercase letters, numbers, and single hyphens, with no edge hyphen.',
        options.location,
      ),
    );
  }

  if (name && name !== options.directoryName) {
    diagnostics.push(
      error(
        'frontmatter.name-directory-mismatch',
        `Skill name "${name}" must match parent directory "${options.directoryName}".`,
        options.location,
      ),
    );
  }

  const body = lines.slice(closingIndex + 1).join('\n').trim();

  if (!body) {
    diagnostics.push(warning('skill.empty-body', 'SKILL.md has no instruction body.', options.location));
  }

  if (lines.length > RECOMMENDED_SKILL_MD_LINES) {
    diagnostics.push(
      warning(
        'skill.recommended-line-limit',
        `SKILL.md has ${lines.length} lines; the open standard recommends fewer than ${RECOMMENDED_SKILL_MD_LINES}.`,
        options.location,
      ),
    );
  }

  if (Math.ceil(body.length / 4) > RECOMMENDED_INSTRUCTION_TOKENS) {
    diagnostics.push(
      warning(
        'skill.recommended-token-limit',
        `The instruction body is estimated above the recommended ${RECOMMENDED_INSTRUCTION_TOKENS}-token limit.`,
        options.location,
      ),
    );
  }

  if (!name || !description || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { diagnostics };
  }

  const skillMetadata: AgentSkillMetadata = {
    name,
    description,
    ...(license ? { license } : {}),
    ...(compatibility ? { compatibility } : {}),
    ...(metadata ? { metadata } : {}),
    ...(allowedTools ? { allowedTools } : {}),
  };
  const skill: ParsedAgentSkillDocument = {
    metadata: skillMetadata,
    body,
    location: options.location,
    root: skillRoot(options.location),
  };

  return { skill, diagnostics };
}
