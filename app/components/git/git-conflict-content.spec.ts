import { describe, expect, it } from 'vitest';
import {
  failedConflictContentState,
  isUsableConflictContent,
  resolveConflictContentState,
} from './git-conflict-content';

describe('isUsableConflictContent', () => {
  it('accepts non-empty string content', () => {
    expect(isUsableConflictContent('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> theirs\n')).toBe(true);
  });

  it('rejects empty / missing content (the data-loss case)', () => {
    expect(isUsableConflictContent('')).toBe(false);
    expect(isUsableConflictContent(undefined)).toBe(false);
    expect(isUsableConflictContent(null)).toBe(false);
    expect(isUsableConflictContent(0)).toBe(false);
  });
});

describe('resolveConflictContentState', () => {
  it('passes through real conflict content with no error', () => {
    const state = resolveConflictContentState('hello world');
    expect(state).toEqual({ content: 'hello world', loading: false });
    expect(state.error).toBeUndefined();
  });

  it('flags an empty fetch result as an error instead of opening an empty editor', () => {
    const state = resolveConflictContentState('');
    expect(state.content).toBe('');
    expect(state.loading).toBe(false);
    expect(state.error).toBe('empty-content');
  });

  it('flags missing content as an error', () => {
    expect(resolveConflictContentState(undefined).error).toBe('empty-content');
    expect(resolveConflictContentState(null).error).toBe('empty-content');
  });
});

describe('failedConflictContentState', () => {
  it('produces an error state with no content for a failed fetch', () => {
    const state = failedConflictContentState();
    expect(state.content).toBe('');
    expect(state.loading).toBe(false);
    expect(state.error).toBe('load-failed');
  });
});
