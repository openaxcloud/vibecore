import { describe, expect, it } from 'vitest';
import {
  blockedPatchLogPrefix,
  dropFailedPatchLogsForPath,
  dropResolvedMissingImportPatchLogs,
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

  describe('dropResolvedMissingImportPatchLogs', () => {
    it('removes stale missing-import failures when the import now resolves', () => {
      const lines = [
        "AI patch failed: src/main.tsx: Missing import in src/main.tsx: './App' does not resolve to a generated or existing file.",
        "AI patch failed: src/App.tsx: Missing import in src/App.tsx: './store/themeStore' does not resolve to a generated or existing file.",
        'AI patch accepted: src/store/themeStore.ts',
      ];

      const files = new Map([
        ['src/main.tsx', "import App from './App';"],
        ['src/App.tsx', "import { useThemeStore } from './store/themeStore';"],
        ['src/store/themeStore.ts', 'export const useThemeStore = () => ({ theme: "dark" });'],
      ]);

      expect(dropResolvedMissingImportPatchLogs(lines, files)).toEqual(['AI patch accepted: src/store/themeStore.ts']);
    });

    it('removes stale css side-effect import failures once css files exist', () => {
      const lines = [
        "AI patch blocked: src/components/Header.tsx: Missing import in src/components/Header.tsx: './Header.css' does not resolve to a generated or existing file.",
        "AI patch failed: src/components/Footer.tsx: Missing import in src/components/Footer.tsx: './Footer.css' does not resolve to a generated or existing file.",
      ];

      const files = new Map([
        ['src/components/Header.tsx', "import './Header.css';"],
        ['src/components/Header.css', '.header { display: flex; }'],
      ]);

      expect(dropResolvedMissingImportPatchLogs(lines, files)).toEqual([
        "AI patch failed: src/components/Footer.tsx: Missing import in src/components/Footer.tsx: './Footer.css' does not resolve to a generated or existing file.",
      ]);
    });

    it('returns null when no logged missing import resolves yet', () => {
      const lines = [
        "AI patch failed: src/main.tsx: Missing import in src/main.tsx: './App' does not resolve to a generated or existing file.",
      ];

      expect(dropResolvedMissingImportPatchLogs(lines, new Map([['src/main.tsx', "import App from './App';"]]))).toBe(
        null,
      );
    });
  });
});
