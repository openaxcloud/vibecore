import { describe, expect, it } from 'vitest';
import {
  blockedPatchLogPrefix,
  dropFailedPatchLogsForPath,
  failedPatchLogPrefix,
  isFailedPatchLogForPath,
} from './agent-patch-logs';

describe('agent-patch-logs helpers', () => {
  describe('failedPatchLogPrefix / blockedPatchLogPrefix', () => {
    it('produces the exact workbench prefix including the trailing colon', () => {
      expect(failedPatchLogPrefix('src/main.tsx')).toBe('AI patch failed: src/main.tsx:');
      expect(blockedPatchLogPrefix('src/main.tsx')).toBe('AI patch blocked: src/main.tsx:');
    });
  });

  describe('isFailedPatchLogForPath', () => {
    it('matches a `failed` entry for the same path', () => {
      expect(
        isFailedPatchLogForPath(
          'AI patch failed: src/main.tsx: Missing import does not resolve to a generated or existing file.',
          'src/main.tsx',
        ),
      ).toBe(true);
    });

    it('matches a `blocked` entry for the same path', () => {
      expect(
        isFailedPatchLogForPath(
          'AI patch blocked: src/Header.tsx: Missing import in src/Header.tsx: ./Header.css',
          'src/Header.tsx',
        ),
      ).toBe(true);
    });

    it('does not match an accepted log entry', () => {
      expect(isFailedPatchLogForPath('AI patch accepted: src/main.tsx', 'src/main.tsx')).toBe(false);
    });

    it('does not match a different path that shares a prefix', () => {
      // Trailing colon guards against `src/Foo` accidentally matching `src/Foo.ts`.
      expect(isFailedPatchLogForPath('AI patch failed: src/Foo.tsx: Missing import.', 'src/Foo')).toBe(false);
    });

    it('returns false for an empty relative path so empty-string callers stay safe', () => {
      expect(isFailedPatchLogForPath('AI patch failed: : oops', '')).toBe(false);
    });
  });

  describe('dropFailedPatchLogsForPath', () => {
    it('removes both failed and blocked entries for the path and preserves order', () => {
      const lines = [
        'Preview started on http://localhost:5173',
        'AI patch failed: src/main.tsx: Missing import in src/main.tsx: ./App',
        'AI patch blocked: src/main.tsx: Missing import in src/main.tsx: ./App',
        'AI patch accepted: src/App.tsx',
        'AI patch accepted: src/main.tsx',
      ];

      expect(dropFailedPatchLogsForPath(lines, 'src/main.tsx')).toEqual([
        'Preview started on http://localhost:5173',
        'AI patch accepted: src/App.tsx',
        'AI patch accepted: src/main.tsx',
      ]);
    });

    it('returns null on a no-op so the caller can skip the store update', () => {
      const lines = ['AI patch accepted: src/App.tsx', 'AI patch accepted: src/main.tsx'];

      expect(dropFailedPatchLogsForPath(lines, 'src/main.tsx')).toBeNull();
    });

    it('only touches entries for the requested path', () => {
      const lines = [
        'AI patch failed: src/Header.tsx: Missing import: ./Header.css',
        'AI patch failed: src/Footer.tsx: Missing import: ./Footer.css',
      ];

      expect(dropFailedPatchLogsForPath(lines, 'src/Header.tsx')).toEqual([
        'AI patch failed: src/Footer.tsx: Missing import: ./Footer.css',
      ]);
    });

    it('returns null when relative path is empty', () => {
      expect(dropFailedPatchLogsForPath(['AI patch failed: : x'], '')).toBeNull();
    });
  });
});
