/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPOSER_DRAFT_DEBOUNCE_MS,
  clearComposerDraft,
  composerDraftStorageKey,
  createComposerDraftWriter,
  readComposerDraft,
  writeComposerDraft,
} from './composer-draft';

const PROJECT_ID = 'proj_123';

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('composerDraftStorageKey', () => {
  it('namespaces the key per project', () => {
    expect(composerDraftStorageKey(PROJECT_ID)).toBe('ecode:composer-draft:proj_123');
    expect(composerDraftStorageKey('other')).not.toBe(composerDraftStorageKey(PROJECT_ID));
  });
});

describe('write/read/clearComposerDraft', () => {
  it('round-trips a draft through sessionStorage', () => {
    writeComposerDraft(PROJECT_ID, 'build me a todo app');
    expect(readComposerDraft(PROJECT_ID)).toBe('build me a todo app');
    expect(window.sessionStorage.getItem(composerDraftStorageKey(PROJECT_ID))).toBe('build me a todo app');
  });

  it('returns null when no draft is stored', () => {
    expect(readComposerDraft(PROJECT_ID)).toBeNull();
  });

  it('treats a whitespace-only stored value as no draft', () => {
    window.sessionStorage.setItem(composerDraftStorageKey(PROJECT_ID), '   \n');
    expect(readComposerDraft(PROJECT_ID)).toBeNull();
  });

  it('drops the key when writing a blank value (emptied composer = no draft)', () => {
    writeComposerDraft(PROJECT_ID, 'draft');
    writeComposerDraft(PROJECT_ID, '   ');
    expect(window.sessionStorage.getItem(composerDraftStorageKey(PROJECT_ID))).toBeNull();
  });

  it('skips persistence entirely without a projectId', () => {
    writeComposerDraft(undefined, 'draft');
    expect(window.sessionStorage.length).toBe(0);
    expect(readComposerDraft(undefined)).toBeNull();
  });

  it('clears a stored draft', () => {
    writeComposerDraft(PROJECT_ID, 'draft');
    clearComposerDraft(PROJECT_ID);
    expect(readComposerDraft(PROJECT_ID)).toBeNull();
  });

  it('keeps drafts isolated between projects', () => {
    writeComposerDraft(PROJECT_ID, 'one');
    writeComposerDraft('proj_456', 'two');
    clearComposerDraft(PROJECT_ID);
    expect(readComposerDraft(PROJECT_ID)).toBeNull();
    expect(readComposerDraft('proj_456')).toBe('two');
  });

  it('degrades silently when storage throws (private mode)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => writeComposerDraft(PROJECT_ID, 'draft')).not.toThrow();
    expect(readComposerDraft(PROJECT_ID)).toBeNull();

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe('createComposerDraftWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces: only the last scheduled value lands, after the delay', () => {
    const writer = createComposerDraftWriter();

    writer.schedule(PROJECT_ID, 'h');
    writer.schedule(PROJECT_ID, 'he');
    writer.schedule(PROJECT_ID, 'hello');

    expect(readComposerDraft(PROJECT_ID)).toBeNull();

    vi.advanceTimersByTime(COMPOSER_DRAFT_DEBOUNCE_MS - 1);
    expect(readComposerDraft(PROJECT_ID)).toBeNull();

    vi.advanceTimersByTime(1);
    expect(readComposerDraft(PROJECT_ID)).toBe('hello');
  });

  it('restarts the delay on every keystroke', () => {
    const writer = createComposerDraftWriter();

    writer.schedule(PROJECT_ID, 'h');
    vi.advanceTimersByTime(COMPOSER_DRAFT_DEBOUNCE_MS - 50);
    writer.schedule(PROJECT_ID, 'hi');
    vi.advanceTimersByTime(COMPOSER_DRAFT_DEBOUNCE_MS - 50);
    expect(readComposerDraft(PROJECT_ID)).toBeNull();

    vi.advanceTimersByTime(50);
    expect(readComposerDraft(PROJECT_ID)).toBe('hi');
  });

  it('flush persists the pending write immediately', () => {
    const writer = createComposerDraftWriter();

    writer.schedule(PROJECT_ID, 'pending');
    writer.flush();
    expect(readComposerDraft(PROJECT_ID)).toBe('pending');

    // Nothing left in flight afterwards.
    vi.advanceTimersByTime(COMPOSER_DRAFT_DEBOUNCE_MS * 2);
    expect(readComposerDraft(PROJECT_ID)).toBe('pending');
  });

  it('flush is a no-op with nothing pending', () => {
    const writer = createComposerDraftWriter();
    expect(() => writer.flush()).not.toThrow();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('cancel drops the pending write (send path)', () => {
    const writer = createComposerDraftWriter();

    writer.schedule(PROJECT_ID, 'about to send');
    writer.cancel();
    vi.advanceTimersByTime(COMPOSER_DRAFT_DEBOUNCE_MS * 2);
    expect(readComposerDraft(PROJECT_ID)).toBeNull();

    // A cancelled write cannot be resurrected by flush either.
    writer.schedule(PROJECT_ID, 'next');
    writer.cancel();
    writer.flush();
    expect(readComposerDraft(PROJECT_ID)).toBeNull();
  });

  it('scheduling a blank value removes the stored draft', () => {
    writeComposerDraft(PROJECT_ID, 'old draft');

    const writer = createComposerDraftWriter();
    writer.schedule(PROJECT_ID, '');
    vi.advanceTimersByTime(COMPOSER_DRAFT_DEBOUNCE_MS);
    expect(readComposerDraft(PROJECT_ID)).toBeNull();
  });

  it('ignores schedules without a projectId', () => {
    const writer = createComposerDraftWriter();

    writer.schedule(undefined, 'draft');
    vi.advanceTimersByTime(COMPOSER_DRAFT_DEBOUNCE_MS);
    writer.flush();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('honours a custom delay', () => {
    const writer = createComposerDraftWriter(1000);

    writer.schedule(PROJECT_ID, 'slow');
    vi.advanceTimersByTime(COMPOSER_DRAFT_DEBOUNCE_MS);
    expect(readComposerDraft(PROJECT_ID)).toBeNull();

    vi.advanceTimersByTime(700);
    expect(readComposerDraft(PROJECT_ID)).toBe('slow');
  });
});
