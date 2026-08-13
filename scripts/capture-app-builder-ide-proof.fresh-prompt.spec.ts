import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

function sourceBetween(start: string, end: string) {
  const startOffset = captureSource.indexOf(start);
  const endOffset = captureSource.indexOf(end, startOffset);

  expect(startOffset, `missing source marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endOffset, `missing source marker: ${end}`).toBeGreaterThan(startOffset);

  return captureSource.slice(startOffset, endOffset);
}

describe('Solutions proof fresh prompt provenance', () => {
  const exactBubbleSource = sourceBetween(
    'async function waitForExactAgentUserPromptBubble',
    '\nasync function resolveResumedPromptProvenance',
  );
  const freshBranchSource = sourceBetween(
    'if (!promptBubbleAvailable && !iterationOnly)',
    '\n    const verifyPromptBubbleSurface',
  );

  const provenanceSource = sourceBetween('const verifyPromptBubbleSurface = async () =>', '\n    if (!iterationOnly)');

  it('requires a real fresh user row matching one of the two strict submitted-prompt forms', () => {
    expect(freshBranchSource).toContain('if (!resume)');
    expect(freshBranchSource).toContain('waitForExactAgentUserPromptBubble(');
    expect(freshBranchSource).toContain('creationPrompt,');
    expect(freshBranchSource).toContain('180_000,');
    expect(freshBranchSource).toContain('true,');
    expect(exactBubbleSource).toContain('matchCompleteSubmittedPrompt(bubbleText, expectedPrompt)');
    expect(exactBubbleSource).not.toMatch(/\.includes\(expectedPrompt\)|\.endsWith\(expectedPrompt\)/u);
  });

  it('binds the manifest to the revalidated visible row instead of trusting the initial lookup', () => {
    expect(provenanceSource).toContain('matchCompleteSubmittedPrompt(visiblePrompt, expectedPrompt)');
    expect(provenanceSource).toContain('matchForm: promptMatch.matchForm');
    expect(provenanceSource).toContain('visiblePrompt: promptMatch.normalizedCandidate');
    expect(provenanceSource).toContain('visiblePromptLength: promptMatch.candidateLength');
    expect(provenanceSource).toContain("promptSha256: createHash('sha256').update(expectedPrompt)");
    expect(provenanceSource).toContain(
      "visiblePromptSha256: createHash('sha256').update(promptMatch.normalizedCandidate)",
    );
  });
});
