import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-QA-PROMPT-IN-README — the README shipped to the customer carried platform
 * internals and the user's private input.
 *
 * Proven live (audit test cluster, 2026-08-12) by creating a project from a
 * booby-trapped prompt and pulling `GET /projects/:id/export/zip`. The extracted
 * README.md contained, verbatim:
 *
 *   - the platform's scaffolding wording ("Application files are intentionally
 *     left for the IDE agent to produce as real generated output"),
 *   - "Requested model: claude-sonnet-4-5-20250929"  (internal model identity),
 *   - "Mon API key interne est sk-corp-A1B2C3D4E5F6 et la base est
 *      postgres://admin:MotDePasse42@10.0.0.5/prod"  (the raw user prompt).
 *
 * That file is exported, committed to the user's git, shipped inside deployment
 * artifacts and visible to every collaborator.
 *
 * The prompt now travels through `ProjectIdeState.chat.pendingPrompt`, which is
 * platform state (never exported) and is already what the IDE consumes.
 */

const appSource = readFileSync(join(__dirname, 'app.ts'), 'utf8');

/** The `sourceType === 'ai'` branch of `starterFiles`, isolated from the rest. */
function aiStarterBranch(): string {
  const start = appSource.indexOf("if (input.sourceType === 'ai') {");
  expect(start).toBeGreaterThan(-1);

  // The branch ends at the next top-level `return [` of the function (blank starter).
  const end = appSource.indexOf("  return [\n    { path: 'README.md'", start);
  expect(end).toBeGreaterThan(start);

  return appSource.slice(start, end);
}

describe('BUG-QA-PROMPT-IN-README — nothing private ships in the delivered README', () => {
  it('the AI starter README no longer interpolates the user prompt', () => {
    const branch = aiStarterBranch();

    // Comments explain the defect, so compare against code only.
    const code = branch.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).not.toContain('input.prompt');
  });

  it('the AI starter README no longer leaks the generation context or model id', () => {
    const code = aiStarterBranch()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    for (const marker of [
      'PROJECT_STARTER_PROMPT_LABEL',
      'PROJECT_STARTER_GENERATION_CONTEXT',
      'PROJECT_STARTER_MODEL',
      'PROJECT_STARTER_FRAMEWORK',
      'PROJECT_STARTER_ARTIFACT_TYPE',
      'input.model',
      'input.framework',
      'input.artifactType',
    ]) {
      expect(code).not.toContain(marker);
    }
  });

  it('the from-ai route carries the prompt through ide-state instead', () => {
    expect(appSource).toMatch(/pendingPrompt:\s*\{[\s\S]{0,200}prompt:\s*body\.prompt/);
    expect(appSource).toMatch(/action:\s*'project\.create_from_ai'/);
  });

  it('keeps the README fallback for projects created BEFORE the fix', () => {
    /*
     * `extractGenerationPrompt` recovers the prompt from legacy READMEs. Removing
     * it would strand every project created before this change, so its anchor
     * strings must stay in the client.
     */
    const client = readFileSync(
      join(__dirname, '..', '..', '..', 'app', 'lib', 'runtime', 'pending-generation.ts'),
      'utf8',
    );

    expect(client).toContain('This project was created from an AI prompt');
    expect(client).toContain("const PROMPT_SECTION_DELIMITER = '\\n\\nPrompt:\\n\\n'");
  });
});
