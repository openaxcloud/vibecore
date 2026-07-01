import type { FileMap } from './constants';
import { WORK_DIR } from '~/utils/constants';

/**
 * Project-level agent rules — the E-Code equivalent of Cursor's `.cursorrules` /
 * `.cursor/rules` and the industry-standard `AGENTS.md` (also Claude's
 * `CLAUDE.md`). These are user-authored instructions that live IN the project and
 * must steer EVERY generation for that project (coding conventions, stack
 * choices, "always do X"). Cursor/Replit inject them into the system prompt; we
 * previously did not read them at all, so a user's project conventions were
 * silently ignored.
 */

export interface ResolvedProjectRule {
  /** Project-relative path, e.g. `AGENTS.md` or `.cursor/rules/style.md`. */
  path: string;
  content: string;
}

export interface ProjectRulesContext {
  files: ResolvedProjectRule[];
  context: string;
}

/*
 * Total injected rules budget. Rules ride in the system prompt on EVERY turn, so
 * an unbounded rules file (or many) would crowd out the real context / cost
 * tokens. 16 KB is generous for genuine convention docs while bounding blast.
 */
const MAX_TOTAL_RULES_CHARS = 16_000;

/** Well-known rules filenames checked at the project root (case-insensitive). */
const ROOT_RULE_FILENAMES = new Set(['agents.md', '.cursorrules', 'claude.md', '.ecode/rules.md', '.ecoderules']);

function stripWorkDir(path: string): string {
  const prefix = `${WORK_DIR}/`;

  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Decide whether a project-relative path is an agent-rules file.
 *
 * Pure + exported for unit testing. Matches the root well-known names plus any
 * markdown/mdc file under a `.cursor/rules/` directory (Cursor's modern rules
 * layout). Case-insensitive on the filename.
 */
export function isProjectRulePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/^\.\//, '').toLowerCase();

  if (ROOT_RULE_FILENAMES.has(normalized)) {
    return true;
  }

  // Cursor `.cursor/rules/*.md` / `*.mdc` layout.
  return /^\.cursor\/rules\/.+\.(md|mdc)$/.test(normalized);
}

/**
 * Render the resolved rules into a system-prompt section. Pure + exported so the
 * format is unit-testable without a live FileMap.
 */
export function formatProjectRulesContext(rules: ResolvedProjectRule[]): string {
  const blocks = rules
    .map((rule) => `### ${rule.path}\n${rule.content.trim()}`)
    .join('\n\n')
    .slice(0, MAX_TOTAL_RULES_CHARS);

  return `<project_rules>
The user has authored the following project-level rules (AGENTS.md / .cursorrules /
.cursor/rules). Treat them as BINDING instructions for this project: follow every
convention, stack choice, and constraint below on every change, without being
reminded. If a rule conflicts with a one-off request, prefer the explicit request
but keep the rest of the rules in force.

${blocks}
</project_rules>`;
}

/**
 * Collect the project's agent-rules files from the in-memory project FileMap and
 * format them for the system prompt. Reads straight from the files the request
 * already carries (the user's own project — no extra fetch, no cross-tenant
 * access). Returns undefined when the project has no rules files.
 *
 * Deterministic ordering (root files first, then `.cursor/rules/*` alphabetically)
 * so the injected prompt is stable across turns.
 */
export function retrieveProjectRulesContext(files: FileMap | undefined): ProjectRulesContext | undefined {
  if (!files) {
    return undefined;
  }

  const resolved: ResolvedProjectRule[] = [];

  for (const [path, dirent] of Object.entries(files)) {
    if (!dirent || dirent.type !== 'file' || dirent.isBinary) {
      continue;
    }

    const relativePath = stripWorkDir(path);

    if (!isProjectRulePath(relativePath)) {
      continue;
    }

    const content = dirent.content?.trim();

    if (content) {
      resolved.push({ path: relativePath, content });
    }
  }

  if (!resolved.length) {
    return undefined;
  }

  resolved.sort((a, b) => {
    const aNested = a.path.includes('/') ? 1 : 0;
    const bNested = b.path.includes('/') ? 1 : 0;

    return aNested - bNested || a.path.localeCompare(b.path);
  });

  return { files: resolved, context: formatProjectRulesContext(resolved) };
}
