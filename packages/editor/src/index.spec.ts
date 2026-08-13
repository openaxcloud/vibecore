import { describe, expect, it } from 'vitest';
import {
  commentSyntaxForLanguage,
  computeEnvMaskLineRanges,
  computeEnvMaskRanges,
  computeEnvRevealLines,
  detectMobileViewport,
  editorBreakpoints,
  editorKindForLayout,
  extractWorkspaceSymbols,
  findRenameMatches,
  findStringAndCommentSpans,
  getEditorMinimapOptions,
  getResponsiveLayoutState,
  isEnvFilePath,
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

  it('keeps large touch tablets on the compact tablet shell', () => {
    const state = getResponsiveLayoutState(1280, 834, { coarsePointer: true });

    expect(state.breakpoint).toBe('tablet-landscape');
    expect(state.isTablet).toBe(true);
    expect(state.isDesktop).toBe(false);
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

describe('scope-aware symbol rename matching', () => {
  it('detects string literal and comment spans, including escapes and templates', () => {
    const source = [
      'const a = "user in string";',
      '// user in line comment',
      '/* user in block */',
      '`user ${user}`',
    ].join('\n');

    const spans = findStringAndCommentSpans(source);
    const masked = (needleIndex: number) => spans.some((span) => needleIndex >= span.start && needleIndex < span.end);

    // The "user" inside the double-quoted string is masked.
    expect(masked(source.indexOf('user in string'))).toBe(true);

    // The "user" in the line comment is masked.
    expect(masked(source.indexOf('user in line comment'))).toBe(true);

    // The "user" in the block comment is masked.
    expect(masked(source.indexOf('user in block'))).toBe(true);

    // The literal text portion of a template string is masked...
    expect(masked(source.indexOf('user ${'))).toBe(true);
  });

  it('renames only code occurrences and leaves strings, comments, and substrings intact', () => {
    const source = [
      'function user() {',
      '  const user = 1;',
      '  return user;', // code usage
      '}',
      'const msg = "user logged in";', // string — must NOT match
      '// the user pressed a key', // comment — must NOT match
      'const username = user;', // `username` must NOT match (\b boundary)
    ].join('\n');

    const matches = findRenameMatches(source, 'user');

    /*
     * Exactly the four real `user` identifier sites: declaration, const,
     * return, and the RHS of `username = user`.
     */
    expect(matches).toHaveLength(4);

    for (const match of matches) {
      expect(source.slice(match.start, match.end)).toBe('user');
    }

    // None of the masked occurrences (string + comment) are included.
    const stringOccurrence = source.indexOf('user logged in');
    const commentOccurrence = source.indexOf('user pressed');
    expect(matches.some((match) => match.start === stringOccurrence)).toBe(false);
    expect(matches.some((match) => match.start === commentOccurrence)).toBe(false);

    // `username` is never partially matched.
    const usernameOccurrence = source.indexOf('username');
    expect(matches.some((match) => match.start === usernameOccurrence)).toBe(false);
  });

  it('does not let an unterminated single-quoted string swallow following code', () => {
    // A stray quote on one line must not mask the identifier on later lines.
    const source = ["const label = 'oops;", 'const user = 1;', 'return user;'].join('\n');

    const matches = findRenameMatches(source, 'user');

    expect(matches).toHaveLength(2);
  });

  it('maps language ids and file paths to the correct comment syntax', () => {
    expect(commentSyntaxForLanguage('python')).toBe('hash');
    expect(commentSyntaxForLanguage('ruby')).toBe('hash');
    expect(commentSyntaxForLanguage('shellscript')).toBe('hash');
    expect(commentSyntaxForLanguage('script.py')).toBe('hash');
    expect(commentSyntaxForLanguage('typescript')).toBe('c-family');
    expect(commentSyntaxForLanguage('component.tsx')).toBe('c-family');
    expect(commentSyntaxForLanguage(undefined)).toBe('c-family');
  });

  it('masks Python "#" comments and triple-quoted docstrings (does not corrupt them on rename)', () => {
    const source = [
      'def login(user):', // code usage of `user`
      '    """Authenticate the user and return user session.', // docstring — must NOT match
      '    The user argument is the username.', // docstring continuation — must NOT match
      '    """',
      '    # log the user in here', // hash comment — must NOT match
      '    return user', // code usage
    ].join('\n');

    const matches = findRenameMatches(source, 'user', 'python');

    /*
     * Only the two real `user` identifier sites (the parameter in the def and the
     * return). Every `user` inside the docstring and the `#` comment is masked.
     */
    expect(matches).toHaveLength(2);

    for (const match of matches) {
      expect(source.slice(match.start, match.end)).toBe('user');
    }

    const docstringOccurrence = source.indexOf('user and return');
    const commentOccurrence = source.indexOf('user in here');
    expect(matches.some((match) => match.start === docstringOccurrence)).toBe(false);
    expect(matches.some((match) => match.start === commentOccurrence)).toBe(false);
  });

  it('treats a Python triple-quoted block as one span, not three empty quotes', () => {
    const source = ["x = '''", 'user lives entirely inside this docstring', "'''", 'user = 1'].join('\n');

    const spans = findStringAndCommentSpans(source, 'hash');
    const masked = (needleIndex: number) => spans.some((span) => needleIndex >= span.start && needleIndex < span.end);

    // The identifier inside the docstring body is masked...
    expect(masked(source.indexOf('user lives'))).toBe(true);

    // ...but the real `user = 1` after the closing ''' is code.
    const matches = findRenameMatches(source, 'user', 'python');
    expect(matches).toHaveLength(1);
    expect(source.slice(matches[0].start, matches[0].end)).toBe('user');
    expect(matches[0].start).toBe(source.lastIndexOf('user'));
  });

  it('does not treat "#" as a comment for C-family languages', () => {
    // In JS, `#` is a private-field sigil, not a comment — must stay code.
    const source = ['class C {', '  #user = 1;', '  get() { return this.#user; }', '}'].join('\n');

    const spans = findStringAndCommentSpans(source, 'c-family');

    expect(spans).toHaveLength(0);
  });
});

describe('dotenv secret masking', () => {
  it('recognises dotenv files across the common naming variants', () => {
    expect(isEnvFilePath('.env')).toBe(true);
    expect(isEnvFilePath('project/.env')).toBe(true);
    expect(isEnvFilePath('.env.local')).toBe(true);
    expect(isEnvFilePath('config/.env.production')).toBe(true);
    expect(isEnvFilePath('app/staging.env')).toBe(true);
    expect(isEnvFilePath('src/App.tsx')).toBe(false);
    expect(isEnvFilePath('README.md')).toBe(false);
    expect(isEnvFilePath(undefined)).toBe(false);
  });

  it('masks the value of every KEY=VALUE line and skips comments and blanks', () => {
    const lines = [
      { from: 0, to: 22, text: 'API_KEY=sk-live-secret' },
      { from: 23, to: 39, text: '# a comment line' },
      { from: 40, to: 40, text: '' },
      { from: 41, to: 64, text: 'DATABASE_URL=postgres://' },
      { from: 65, to: 71, text: 'NOVALUE' },
    ];

    const ranges = computeEnvMaskRanges(lines);

    /* Only the two real KEY=VALUE lines should be masked. */
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toMatchObject({ from: 8, to: 22, value: 'sk-live-secret' });
    expect(ranges[1]).toMatchObject({ from: 54, to: 64, value: 'postgres://' });
  });

  it('reveals the secret on lines the caret is editing so the file stays editable', () => {
    const lines = [
      { from: 0, to: 22, text: 'API_KEY=sk-live-secret' },
      { from: 23, to: 46, text: 'DATABASE_URL=postgres://' },
    ];

    const ranges = computeEnvMaskRanges(lines, new Set([0]));

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ value: 'postgres://' });
  });

  it('computes 1-based Monaco line/column ranges for secret values', () => {
    const ranges = computeEnvMaskLineRanges(['API_KEY=sk-live-secret', '# comment', 'EMPTY=']);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ line: 1, startColumn: 9, endColumn: 23, length: 14 });
  });

  it('leaves the caret line unmasked in Monaco so a secret can be edited without going blind', () => {
    const lineTexts = ['API_KEY=sk-live-secret', 'DATABASE_URL=postgres://'];

    /* Caret on line 1: that secret stays visible, the other stays masked. */
    const ranges = computeEnvMaskLineRanges(lineTexts, new Set([1]));

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ line: 2 });
  });

  it('derives reveal lines from Monaco selections (start and end of each)', () => {
    const revealLines = computeEnvRevealLines([
      { startLineNumber: 2, endLineNumber: 2 },
      { startLineNumber: 4, endLineNumber: 6 },
    ]);

    expect([...revealLines].sort((a, b) => a - b)).toEqual([2, 4, 6]);
  });

  it('returns an empty reveal set for missing/empty Monaco selections', () => {
    expect(computeEnvRevealLines(null).size).toBe(0);
    expect(computeEnvRevealLines(undefined).size).toBe(0);
    expect(computeEnvRevealLines([]).size).toBe(0);
  });
});
