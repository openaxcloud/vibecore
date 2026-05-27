import { describe, expect, it } from 'vitest';
import {
  detectMobileViewport,
  editorBreakpoints,
  editorKindForLayout,
  extractWorkspaceSymbols,
  getEditorMinimapOptions,
  getResponsiveLayoutState,
  isWorkspaceSemanticFile,
  languageForPath,
} from './index.js';

describe('responsive editor layout', () => {
  it('maps desktop, tablet, and mobile breakpoints', () => {
    expect(getResponsiveLayoutState(1440, 900).breakpoint).toBe('desktop');
    expect(getResponsiveLayoutState(editorBreakpoints.desktop, 900).isDesktop).toBe(true);
    expect(getResponsiveLayoutState(1024, 768).breakpoint).toBe('tablet-landscape');
    expect(getResponsiveLayoutState(1194, 834).breakpoint).toBe('tablet-landscape');
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

  it('uses Monaco only on desktop', () => {
    expect(editorKindForLayout(getResponsiveLayoutState(1440, 900))).toBe('monaco');
    expect(editorKindForLayout(getResponsiveLayoutState(1024, 768))).toBe('codemirror');
    expect(editorKindForLayout(getResponsiveLayoutState(820, 1180))).toBe('codemirror');
    expect(editorKindForLayout(getResponsiveLayoutState(390, 844))).toBe('codemirror');
  });

  it('enables a readable Monaco minimap with a visible viewport slider', () => {
    expect(getEditorMinimapOptions({ minimapEnabled: true })).toMatchObject({
      enabled: true,
      autohide: false,
      renderCharacters: true,
      showSlider: 'always',
      side: 'right',
      size: 'proportional',
      maxColumn: 140,
      scale: 1.35,
    });
    expect(getEditorMinimapOptions({ minimapEnabled: false })).toEqual({ enabled: false });
    expect(getEditorMinimapOptions({ minimapEnabled: true, largeFile: true })).toEqual({ enabled: false });
  });
});

describe('workspace editor semantics', () => {
  it('maps common production languages to Monaco language ids', () => {
    expect(languageForPath('src/App.tsx')).toBe('typescript');
    expect(languageForPath('service/main.py')).toBe('python');
    expect(languageForPath('cmd/api/main.go')).toBe('go');
    expect(languageForPath('src/lib.rs')).toBe('rust');
    expect(languageForPath('src/Main.java')).toBe('java');
    expect(languageForPath('native/addon.cpp')).toBe('cpp');
  });

  it('indexes workspace symbols used by completion, references and rename providers', () => {
    const symbols = extractWorkspaceSymbols(
      'src/App.tsx',
      [
        'export function App() { return <Header />; }',
        'const Header = () => <header className="hero">Hello</header>;',
        'class ProjectRunner {}',
        '.hero { color: red; }',
      ].join('\n'),
    );

    expect(symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining(['function:App', 'component:Header', 'class:ProjectRunner', 'selector:.hero']),
    );
  });

  it('skips huge or unsupported files from semantic indexing', () => {
    expect(isWorkspaceSemanticFile('image.png', 'binary')).toBe(false);
    expect(isWorkspaceSemanticFile('src/App.tsx', 'x'.repeat(500_001))).toBe(false);
  });
});
