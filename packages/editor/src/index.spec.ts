import { describe, expect, it } from 'vitest';
import { editorBreakpoints, editorKindForLayout, getResponsiveLayoutState } from './index.js';

describe('responsive editor layout', () => {
  it('maps desktop, tablet, and mobile breakpoints', () => {
    expect(getResponsiveLayoutState(1440).breakpoint).toBe('desktop');
    expect(getResponsiveLayoutState(editorBreakpoints.desktop).isDesktop).toBe(true);
    expect(getResponsiveLayoutState(1024).breakpoint).toBe('tablet-landscape');
    expect(getResponsiveLayoutState(820).breakpoint).toBe('tablet-portrait');
    expect(getResponsiveLayoutState(390).breakpoint).toBe('mobile');
  });

  it('captures touch and motion capabilities for mobile app shells', () => {
    const state = getResponsiveLayoutState(430, { coarsePointer: true, reducedMotion: true });

    expect(state.isMobile).toBe(true);
    expect(state.hasCoarsePointer).toBe(true);
    expect(state.prefersReducedMotion).toBe(true);
    expect(state.safeArea.bottom).toContain('safe-area-inset-bottom');
  });

  it('uses Monaco only on desktop and landscape tablets', () => {
    expect(editorKindForLayout(getResponsiveLayoutState(1440))).toBe('monaco');
    expect(editorKindForLayout(getResponsiveLayoutState(1024))).toBe('monaco');
    expect(editorKindForLayout(getResponsiveLayoutState(820))).toBe('codemirror');
    expect(editorKindForLayout(getResponsiveLayoutState(390))).toBe('codemirror');
  });
});
