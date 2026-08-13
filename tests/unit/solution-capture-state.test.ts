import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- this unit test exercises a standalone capture-script module.
import {
  EMPTY_PROJECT_FILE_STABILITY,
  findPersistedPromptEvidence,
  normalizeCaptureProofText,
  observeProjectFileRevision,
  projectFilesRevisionFromEntries,
  projectFilesAreStable,
} from '../../scripts/solution-capture-state';

describe('Solutions capture persistence state', () => {
  it('requires repeated, continuous file observations for the full quiet window', () => {
    const first = observeProjectFileRevision(EMPTY_PROJECT_FILE_STABILITY, 'revision-a', 1_000, 10_000);
    const second = observeProjectFileRevision(first, 'revision-a', 6_000, 10_000);
    const third = observeProjectFileRevision(second, 'revision-a', 11_000, 10_000);

    expect(first).toMatchObject({ stableForMs: 0, unchangedReads: 0 });
    expect(second).toMatchObject({ stableForMs: 5_000, unchangedReads: 1 });
    expect(third).toMatchObject({ stableForMs: 10_000, unchangedReads: 2 });
    expect(projectFilesAreStable(third, 10_000, 3)).toBe(false);

    const fourth = observeProjectFileRevision(third, 'revision-a', 16_000, 10_000);

    expect(projectFilesAreStable(fourth, 15_000, 3)).toBe(true);
  });

  it('resets the proof window after a file change, missing read, long gap, or clock regression', () => {
    const stable = {
      revision: 'revision-a',
      stableForMs: 30_000,
      unchangedReads: 6,
      lastObservedAtMs: 40_000,
    };

    expect(observeProjectFileRevision(stable, 'revision-b', 45_000, 10_000)).toEqual({
      revision: 'revision-b',
      stableForMs: 0,
      unchangedReads: 0,
      lastObservedAtMs: 45_000,
    });
    expect(observeProjectFileRevision(stable, undefined, 45_000, 10_000)).toEqual(EMPTY_PROJECT_FILE_STABILITY);
    expect(observeProjectFileRevision(stable, 'revision-a', 60_001, 10_000)).toMatchObject({
      stableForMs: 0,
      unchangedReads: 0,
      lastObservedAtMs: 60_001,
    });
    expect(observeProjectFileRevision(stable, 'revision-a', 39_999, 10_000)).toMatchObject({
      stableForMs: 0,
      unchangedReads: 0,
      lastObservedAtMs: 39_999,
    });
  });

  it('hashes file state deterministically and changes when source changes', () => {
    const first = projectFilesRevisionFromEntries([
      { path: 'src/main.tsx', content: 'export const value = 1;' },
      { path: 'package.json', content: '{}' },
    ]);
    const reordered = projectFilesRevisionFromEntries([
      { path: 'package.json', content: '{}' },
      { path: 'src/main.tsx', content: 'export const value = 1;' },
    ]);
    const changed = projectFilesRevisionFromEntries([
      { path: 'package.json', content: '{}' },
      { path: 'src/main.tsx', content: 'export const value = 2;' },
    ]);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
    expect(projectFilesRevisionFromEntries([])).toBeUndefined();
  });

  it('normalizes prompt and bubble whitespace without changing their wording', () => {
    expect(normalizeCaptureProofText('  Build\n\tPeopleOps   with HR-04.  ')).toBe('Build PeopleOps with HR-04.');
  });

  it('accepts a complete persisted user submission after the server project contract', () => {
    const prompt = 'PeopleOps: build the HR-04 procedure search. Keep the demo local and explicit.';

    const chat = {
      messages: [
        { role: 'assistant', content: `Implemented ${prompt}` },
        {
          role: 'user',
          content: `Artifact type: web\nPreferred framework: React + Vite + TypeScript\n\nProduction quality bar:\n- Build a complete app.\n\nUser prompt:\n${prompt}`,
        },
      ],
    };

    expect(findPersistedPromptEvidence(chat, prompt)).toEqual({
      source: 'ide-state-message',
      candidateLength: normalizeCaptureProofText(chat.messages[1].content).length,
      expectedLength: normalizeCaptureProofText(prompt).length,
    });
  });

  it('checks archived and branched messages without accepting assistant prose', () => {
    const prompt = 'Build Meridian Studio with five working architectural views.';

    expect(
      findPersistedPromptEvidence(
        {
          messages: [{ role: 'assistant', content: `I built this: ${prompt}` }],
          archivedMessages: [{ role: 'user', content: prompt }],
        },
        prompt,
      )?.source,
    ).toBe('ide-state-archived-message');

    expect(
      findPersistedPromptEvidence(
        {
          messages: [{ role: 'assistant', content: prompt }],
          conversations: [{ messages: [{ role: 'user', content: prompt }] }],
        },
        prompt,
      )?.source,
    ).toBe('ide-state-conversation-message');
  });

  it('rejects snippets, pending prompts, arbitrary wrappers, and appended content', () => {
    const prompt = 'Build PeopleOps with the complete HR-04 workflow and local feedback state.';

    const chatWithPendingPromptOnly = {
      messages: [
        { role: 'user', content: 'Build PeopleOps' },
        { role: 'assistant', content: prompt },
        { role: 'user', content: `Untrusted wrapper ending with the same value: ${prompt}` },
        { role: 'user', content: `User prompt: ${prompt}` },
        { role: 'user', content: `${prompt} Also add an unrequested external integration.` },
      ],
      pendingPrompt: { prompt },
    };

    expect(findPersistedPromptEvidence(chatWithPendingPromptOnly, prompt)).toBeUndefined();
  });
});
