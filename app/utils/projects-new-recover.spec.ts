import { describe, expect, it } from 'vitest';
import { findRecentlyCreatedAiProject, mayHaveCreatedProject, type RecoverableProject } from './projects-new-recover';

describe('mayHaveCreatedProject', () => {
  it('treats a thrown Response (HTTP error reply) as safe — no project created', () => {
    expect(mayHaveCreatedProject(new Response('boom', { status: 500 }))).toBe(false);
    expect(mayHaveCreatedProject(new Response('nope', { status: 400 }))).toBe(false);
  });

  it('treats network / lost-response errors as ambiguous (may have created)', () => {
    expect(mayHaveCreatedProject(new TypeError('terminated'))).toBe(true);
    expect(mayHaveCreatedProject(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(mayHaveCreatedProject(new Error('socket hang up'))).toBe(true);
    expect(mayHaveCreatedProject(undefined)).toBe(true);
  });
});

describe('findRecentlyCreatedAiProject', () => {
  const attemptStartedAt = Date.parse('2026-06-24T12:00:00.000Z');
  const justAfter = new Date(attemptStartedAt + 1_000).toISOString();

  const aiMatch: RecoverableProject = {
    id: 'proj_ai_1',
    slug: 'todo-app',
    name: 'Todo App',
    sourceType: 'ai',
    createdAt: justAfter,
  };

  it('returns the AI project created during the attempt', () => {
    expect(findRecentlyCreatedAiProject([aiMatch], { name: 'Todo App', attemptStartedAt })).toEqual(aiMatch);
  });

  it('trims the submitted name before matching', () => {
    expect(findRecentlyCreatedAiProject([aiMatch], { name: '  Todo App  ', attemptStartedAt })).toEqual(aiMatch);
  });

  it('ignores non-ai source types (the empty/blank fallback must not be reused)', () => {
    const blank: RecoverableProject = { ...aiMatch, id: 'proj_blank', sourceType: 'blank' };
    expect(findRecentlyCreatedAiProject([blank], { name: 'Todo App', attemptStartedAt })).toBeUndefined();
  });

  it('ignores a same-named AI project created before the attempt window', () => {
    const stale: RecoverableProject = {
      ...aiMatch,
      id: 'proj_stale',
      createdAt: new Date(attemptStartedAt - 5 * 60_000).toISOString(),
    };
    expect(findRecentlyCreatedAiProject([stale], { name: 'Todo App', attemptStartedAt })).toBeUndefined();
  });

  it('tolerates small clock skew (project clock slightly behind the web pod)', () => {
    const slightlyBefore: RecoverableProject = {
      ...aiMatch,
      createdAt: new Date(attemptStartedAt - 30_000).toISOString(),
    };
    expect(findRecentlyCreatedAiProject([slightlyBefore], { name: 'Todo App', attemptStartedAt })).toEqual(
      slightlyBefore,
    );
  });

  it('requires a name match', () => {
    expect(findRecentlyCreatedAiProject([aiMatch], { name: 'Different', attemptStartedAt })).toBeUndefined();
  });

  it('returns the newest matching project when several exist', () => {
    const older: RecoverableProject = {
      ...aiMatch,
      id: 'proj_older',
      createdAt: new Date(attemptStartedAt + 500).toISOString(),
    };
    const newer: RecoverableProject = {
      ...aiMatch,
      id: 'proj_newer',
      createdAt: new Date(attemptStartedAt + 5_000).toISOString(),
    };
    expect(findRecentlyCreatedAiProject([older, newer], { name: 'Todo App', attemptStartedAt })?.id).toBe('proj_newer');
  });

  it('skips entries with invalid / missing createdAt or id', () => {
    const noDate: RecoverableProject = { ...aiMatch, id: 'proj_nodate', createdAt: undefined };
    const badDate: RecoverableProject = { ...aiMatch, id: 'proj_baddate', createdAt: 'not-a-date' };
    const noId = { ...aiMatch, id: '' } as RecoverableProject;
    expect(
      findRecentlyCreatedAiProject([noDate, badDate, noId], { name: 'Todo App', attemptStartedAt }),
    ).toBeUndefined();
  });

  it('returns undefined for empty / nullish lists and blank target name', () => {
    expect(findRecentlyCreatedAiProject([], { name: 'Todo App', attemptStartedAt })).toBeUndefined();
    expect(findRecentlyCreatedAiProject(null, { name: 'Todo App', attemptStartedAt })).toBeUndefined();
    expect(findRecentlyCreatedAiProject(undefined, { name: 'Todo App', attemptStartedAt })).toBeUndefined();
    expect(findRecentlyCreatedAiProject([aiMatch], { name: '   ', attemptStartedAt })).toBeUndefined();
  });
});
