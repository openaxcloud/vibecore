import { describe, expect, it } from 'vitest';
import { detectMobileViewport, editorBreakpoints, editorKindForLayout, getResponsiveLayoutState } from './index.js';

describe('responsive editor layout', () => {
  it('maps desktop, tablet, and mobile breakpoints', () => {
    expect(getResponsiveLayoutState(1440, 900).breakpoint).toBe('desktop');
    expect(getResponsiveLayoutState(editorBreakpoints.desktop, 900).isDesktop).toBe(true);
    expect(getResponsiveLayoutState(1024, 768).breakpoint).toBe('tablet-landscape');
    expect(getResponsiveLayoutState(820, 1180).breakpoint).toBe('tablet-portrait');
    expect(getResponsiveLayoutState(390, 844).breakpoint).toBe('mobile');
  });

  it('treats short landscape viewports as mobile shells', () => {
    expect(detectMobileViewport(932, 430)).toBe(true);
    expect(getResponsiveLayoutState(932, 430).breakpoint).toBe('mobile');
    expect(getResponsiveLayoutState(932, 430).isMobileLandscape).toBe(true);
    expect(getResponsiveLayoutState(1180, 480).breakpoint).toBe('mobile');
  });

  it('captures touch and motion capabilities for mobile app shells', () => {
    const state = getResponsiveLayoutState(430, 932, { coarsePointer: true, reducedMotion: true });

    expect(state.isMobile).toBe(true);
    expect(state.hasCoarsePointer).toBe(true);
    expect(state.prefersReducedMotion).toBe(true);
    expect(state.safeArea.bottom).toContain('safe-area-inset-bottom');
  });

  it('uses Monaco only on desktop and landscape tablets', () => {
    expect(editorKindForLayout(getResponsiveLayoutState(1440, 900))).toBe('monaco');
    expect(editorKindForLayout(getResponsiveLayoutState(1024, 768))).toBe('monaco');
    expect(editorKindForLayout(getResponsiveLayoutState(820, 1180))).toBe('codemirror');
    expect(editorKindForLayout(getResponsiveLayoutState(390, 844))).toBe('codemirror');
  });
});
