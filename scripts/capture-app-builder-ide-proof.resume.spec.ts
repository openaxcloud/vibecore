import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

function sourceBetween(start: string, end: string) {
  return captureSource.slice(captureSource.indexOf(start), captureSource.indexOf(end));
}

describe('Solutions proof capture resume provenance', () => {
  const exactBubbleSource = sourceBetween(
    'async function waitForExactAgentUserPromptBubble',
    '\nasync function resolveResumedPromptProvenance',
  );
  const resolverSource = sourceBetween(
    'async function resolveResumedPromptProvenance',
    '\nasync function restoreResumedPromptBubbleFromHistory',
  );
  const historyRestoreSource = sourceBetween(
    'async function restoreResumedPromptBubbleFromHistory',
    '\nasync function prepareIdeCapture',
  );

  it('requires authenticated ide-state evidence before attempting UI restoration', () => {
    expect(resolverSource).toContain('readProjectIdeState(page, projectId, token)');
    expect(resolverSource).toContain('findPersistedPromptEvidence(projectState.chat, creationPrompt)');
    expect(resolverSource).toContain('Rerun without --resume');
  });

  it('restores and captures only the real Agent user bubble through Conversation history', () => {
    expect(historyRestoreSource).toContain('Conversation history|Historique des conversations');
    expect(historyRestoreSource).toContain('Project agent history|Historique des agents de projet');
    expect(historyRestoreSource).toContain('Search agent checkpoints|Points de contrôle des agents de recherche');
    expect(historyRestoreSource).toContain('View Chat|Afficher le chat');
    expect(historyRestoreSource).toContain('checkpointTitleFragment');
    expect(historyRestoreSource).toMatch(/page\s*\.waitForEvent\('framenavigated'/u);
    expect(historyRestoreSource).toContain("page.getByTestId('ide-agent-panel')");
    expect(historyRestoreSource).toContain("toHaveAttribute('data-message-id'");
    expect(exactBubbleSource).toContain("agentPanel.locator('.bolt-chat-message-row-user')");
    expect(exactBubbleSource).toContain('normalizeCaptureProofText(bubbleText) === expectedPrompt');
    expect(captureSource).not.toContain('agentPanel.getByText(creationPrompt');
    expect(captureSource).toContain('captureThemedIdeState(page, stagingRoot, promptFilename');
    expect(captureSource).toContain('verifySurface: verifyPromptBubbleSurface');
  });

  it('never writes prompt history, project files, or synthetic DOM during resume recovery', () => {
    expect(resolverSource).not.toMatch(/request\.(?:post|put|patch|delete)\(/u);
    expect(resolverSource).not.toMatch(/setMessages|innerHTML|createElement|dispatchEvent/u);
    expect(exactBubbleSource).not.toMatch(/setMessages|innerHTML|createElement|dispatchEvent/u);
    expect(historyRestoreSource).not.toMatch(/setMessages|innerHTML|createElement|dispatchEvent/u);
    expect(historyRestoreSource).not.toMatch(/\.evaluate\(/u);
    expect(captureSource).not.toContain('ide-editor-persisted-prompt');
  });
});
