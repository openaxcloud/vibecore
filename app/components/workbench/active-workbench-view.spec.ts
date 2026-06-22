import { describe, expect, it } from 'vitest';
import { resolveActiveWorkbenchView } from './active-workbench-view';

describe('resolveActiveWorkbenchView', () => {
  describe('desktop', () => {
    it('mirrors the selected tab exactly', () => {
      for (const view of ['code', 'diff', 'preview', 'git'] as const) {
        expect(
          resolveActiveWorkbenchView({
            useMobileWorkbench: false,
            mobilePanel: undefined,
            selectedView: view,
          }),
        ).toBe(view);
      }
    });
  });

  describe('mobile / tablet', () => {
    it('shows preview when the preview bottom-nav panel is active', () => {
      expect(
        resolveActiveWorkbenchView({
          useMobileWorkbench: true,
          mobilePanel: 'preview',
          selectedView: 'code',
        }),
      ).toBe('preview');
    });

    it('defaults non-preview panels to code', () => {
      for (const panel of ['files', 'editor', 'search', 'locks', 'terminal', 'deploy'] as const) {
        expect(
          resolveActiveWorkbenchView({
            useMobileWorkbench: true,
            mobilePanel: panel,
            selectedView: 'code',
          }),
        ).toBe('code');
      }
    });

    /*
     * Regression: tapping the mobile "Review" button sets selectedView to
     * 'diff'. Before the fix the resolver ignored selectedView on mobile and
     * stayed on 'code', so the DiffView never slid into view and the agent's
     * proposed changes were unreviewable on mobile.
     */
    it('honors a diff selection so the mobile Review button reaches the diff view', () => {
      expect(
        resolveActiveWorkbenchView({
          useMobileWorkbench: true,
          mobilePanel: 'editor',
          selectedView: 'diff',
        }),
      ).toBe('diff');
    });

    it('keeps preview priority over a stale diff selection', () => {
      expect(
        resolveActiveWorkbenchView({
          useMobileWorkbench: true,
          mobilePanel: 'preview',
          selectedView: 'diff',
        }),
      ).toBe('preview');
    });
  });
});
