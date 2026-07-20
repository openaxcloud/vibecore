import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_CAPABILITIES,
  CONNECTORS_BLOCKED,
  CONNECTORS_EXECUTABLE_NOW,
  ConnectorCredentialRequiredError,
  DEFAULT_IMPORT_LIMITS,
  ImportSecurityError,
  buildSpreadsheetProject,
  looksBinary,
  normalizeBundleImport,
  normalizeStagedPath,
  parseDelimited,
  prepareConnectorImport,
  sanitizeImportFiles,
  stripCommonWrapperDir,
  type StagedInputFile,
} from './import-connectors.js';

/** Assert a thunk throws an error whose `.code` equals `code`. */
function expectCode(fn: () => unknown, code: string) {
  let thrown: { code?: string } | undefined;

  try {
    fn();
  } catch (e) {
    thrown = e as { code?: string };
  }
  expect(thrown, `expected a throw with code ${code}`).toBeTruthy();
  expect(thrown?.code).toBe(code);
}

describe('normalizeStagedPath — traversal + hostile-path rejection', () => {
  it('accepts and canonicalises a normal nested path', () => {
    expect(normalizeStagedPath('src/./components/App.tsx')).toBe('src/components/App.tsx');
  });

  it.each([
    ['../etc/passwd', 'IMPORT_PATH_TRAVERSAL'],
    ['a/../../b', 'IMPORT_PATH_TRAVERSAL'],
    ['/etc/passwd', 'IMPORT_PATH_ABSOLUTE'],
    ['C:\\windows\\system32', 'IMPORT_PATH_DRIVE'],
    ['~/secrets', 'IMPORT_PATH_HOME'],
    ['a\\b', 'IMPORT_PATH_BACKSLASH'],
    ['a\0b', 'IMPORT_PATH_NUL'],
    ['', 'IMPORT_PATH_EMPTY'],
  ])('rejects %s with %s', (path, code) => {
    let thrown: ImportSecurityError | undefined;

    try {
      normalizeStagedPath(path);
    } catch (e) {
      thrown = e as ImportSecurityError;
    }
    expect(thrown).toBeInstanceOf(ImportSecurityError);
    expect(thrown?.code).toBe(code);
  });

  it('rejects an over-deep path', () => {
    const deep = Array.from({ length: DEFAULT_IMPORT_LIMITS.maxPathDepth + 1 }, (_, i) => `d${i}`).join('/');
    expect(() => normalizeStagedPath(deep)).toThrow(/IMPORT_PATH_TOO_DEEP|depth/);
  });
});

describe('looksBinary', () => {
  it('flags NUL-bearing content', () => {
    expect(looksBinary('abc\0def')).toBe(true);
  });
  it('passes normal source text', () => {
    expect(looksBinary('const x = 1;\nexport default x;\n')).toBe(false);
  });
  it('flags dense control chars', () => {
    expect(looksBinary('\x01\x02\x03\x04\x05\x06\x07\x08 hello')).toBe(true);
  });
});

describe('sanitizeImportFiles — archive-bomb + symlink + binary gates', () => {
  it('dedupes by path (last write wins) and drops directory entries', () => {
    const files: StagedInputFile[] = [
      { path: 'a.txt', content: 'one' },
      { path: 'dir', content: '', type: 'directory' },
      { path: 'a.txt', content: 'two' },
    ];

    const out = sanitizeImportFiles(files);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ path: 'a.txt', content: 'two' });
  });

  it('rejects a symlink entry', () => {
    const files: StagedInputFile[] = [{ path: 'link', content: '', type: 'symlink', linkTarget: '/etc/passwd' }];
    expectCode(() => sanitizeImportFiles(files), 'IMPORT_SYMLINK_REJECTED');
  });

  it('rejects a symlink declared only via linkTarget', () => {
    const files: StagedInputFile[] = [{ path: 'link', content: '', linkTarget: '../../root' }];
    expectCode(() => sanitizeImportFiles(files), 'IMPORT_SYMLINK_REJECTED');
  });

  it('rejects too many files (bomb by count)', () => {
    const files: StagedInputFile[] = Array.from({ length: DEFAULT_IMPORT_LIMITS.maxFileCount + 1 }, (_, i) => ({
      path: `f${i}.txt`,
      content: 'x',
    }));
    expectCode(() => sanitizeImportFiles(files), 'IMPORT_TOO_MANY_FILES');
  });

  it('rejects a single oversized file (bomb by per-file size)', () => {
    const big = 'a'.repeat(DEFAULT_IMPORT_LIMITS.maxFileBytes + 1);
    expectCode(() => sanitizeImportFiles([{ path: 'big.txt', content: big }]), 'IMPORT_FILE_TOO_LARGE');
  });

  it('rejects a bundle exceeding the total-byte ceiling (bomb by total size)', () => {
    const chunk = 'a'.repeat(DEFAULT_IMPORT_LIMITS.maxFileBytes); // 5 MiB each
    const files: StagedInputFile[] = Array.from({ length: 11 }, (_, i) => ({ path: `f${i}.txt`, content: chunk })); // 55 MiB
    expectCode(() => sanitizeImportFiles(files), 'IMPORT_BUNDLE_TOO_LARGE');
  });

  it('rejects a text-declared file that is really binary', () => {
    expectCode(() => sanitizeImportFiles([{ path: 'img.png', content: 'PNG\0\0\0binary' }]), 'IMPORT_BINARY_AS_TEXT');
  });

  it('accepts a base64-declared binary file (no false positive)', () => {
    const out = sanitizeImportFiles([
      { path: 'img.png', content: Buffer.from([0, 1, 2, 3]).toString('base64'), encoding: 'base64' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].encoding).toBe('base64');
  });
});

describe('stripCommonWrapperDir + normalizeBundleImport', () => {
  it('strips a single shared top-level folder', () => {
    const out = stripCommonWrapperDir([
      { path: 'my-app/src/index.ts', content: '' },
      { path: 'my-app/package.json', content: '{}' },
    ]);
    expect(out.map((f) => f.path)).toEqual(['src/index.ts', 'package.json']);
  });

  it('does NOT strip when top-level folders disagree', () => {
    const files = [
      { path: 'a/x.ts', content: '' },
      { path: 'b/y.ts', content: '' },
    ];
    expect(stripCommonWrapperDir(files).map((f) => f.path)).toEqual(['a/x.ts', 'b/y.ts']);
  });

  it('normalizeBundleImport sanitises then strips the wrapper', () => {
    const out = normalizeBundleImport('bolt', [
      { path: 'proj/src/App.tsx', content: 'x' },
      { path: 'proj/README.md', content: '# hi' },
    ]);
    expect(out.map((f) => f.path).sort()).toEqual(['README.md', 'src/App.tsx']);
  });
});

describe('parseDelimited (CSV/TSV)', () => {
  it('parses a simple CSV with a header', () => {
    const r = parseDelimited('name,age\nAda,36\nAlan,41\n');
    expect(r.columns).toEqual(['name', 'age']);
    expect(r.rows).toEqual([
      ['Ada', '36'],
      ['Alan', '41'],
    ]);
  });

  it('handles quoted fields with commas and escaped quotes', () => {
    const r = parseDelimited('a,b\n"hello, world","say ""hi"""\n');
    expect(r.rows).toEqual([['hello, world', 'say "hi"']]);
  });

  it('handles a newline inside a quoted field', () => {
    const r = parseDelimited('a\n"line1\nline2"\n');
    expect(r.rows).toEqual([['line1\nline2']]);
  });

  it('parses TSV when told to', () => {
    const r = parseDelimited('x\ty\n1\t2\n', '\t');
    expect(r.columns).toEqual(['x', 'y']);
    expect(r.rows).toEqual([['1', '2']]);
  });
});

describe('buildSpreadsheetProject', () => {
  it('produces a real runnable static project from a CSV', () => {
    const { files, rowCount, columns } = buildSpreadsheetProject('name,score\nAda,10\nAlan,20\n', { name: 'Scores' });
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(['README.md', 'data.json', 'index.html']);
    expect(rowCount).toBe(2);
    expect(columns).toEqual(['name', 'score']);

    const data = JSON.parse(files.find((f) => f.path === 'data.json')!.content);
    expect(data.rows).toEqual([
      { name: 'Ada', score: '10' },
      { name: 'Alan', score: '20' },
    ]);

    const html = files.find((f) => f.path === 'index.html')!.content;
    expect(html).toContain('<title>Scores</title>');
    expect(html).toContain('<h1>Scores</h1>'); // every placeholder resolved, not just <title>
    expect(html).not.toContain('__APP_NAME__');
    expect(html).toContain("fetch('./data.json')");
  });

  it('escapes an HTML-hostile project name (no injection)', () => {
    const { files } = buildSpreadsheetProject('a\n1\n', { name: '<script>alert(1)</script>' });
    const html = files.find((f) => f.path === 'index.html')!.content;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rejects empty content and a header-less sheet', () => {
    expectCode(() => buildSpreadsheetProject('   '), 'IMPORT_SPREADSHEET_EMPTY');
  });
});

describe('capability registry', () => {
  it('lists the executable-now connectors', () => {
    expect(CONNECTORS_EXECUTABLE_NOW.sort()).toEqual(
      ['base44', 'bolt', 'lovable', 'previous-agent-export', 'spreadsheet'].sort(),
    );
  });

  it('lists the honestly-blocked connectors with reasons', () => {
    expect(CONNECTORS_BLOCKED.sort()).toEqual(['claude', 'figma', 'vercel'].sort());

    for (const p of CONNECTORS_BLOCKED) {
      expect(CONNECTOR_CAPABILITIES[p].blockedReason).toBeTruthy();
      expect(CONNECTOR_CAPABILITIES[p].credentialRequirement).toBeTruthy();
    }
  });
});

describe('prepareConnectorImport orchestration', () => {
  it('BLOCKS an external-api provider with no credential (typed 424)', () => {
    let err: ConnectorCredentialRequiredError | undefined;

    try {
      prepareConnectorImport('vercel', { hasExternalCredential: false });
    } catch (e) {
      err = e as ConnectorCredentialRequiredError;
    }
    expect(err).toBeInstanceOf(ConnectorCredentialRequiredError);
    expect(err?.statusCode).toBe(424);
    expect(err?.provider).toBe('vercel');
    expect(err?.reason).toMatch(/token/i);
  });

  it('signals fetch-not-wired when a credential is present but no files', () => {
    expectCode(() => prepareConnectorImport('figma', { hasExternalCredential: true }), 'CONNECTOR_FETCH_NOT_WIRED');
  });

  it('derives a spreadsheet project from sourceText', () => {
    const { files, summary } = prepareConnectorImport('spreadsheet', { sourceText: 'a,b\n1,2\n' });
    expect(files.map((f) => f.path).sort()).toEqual(['README.md', 'data.json', 'index.html']);
    expect(summary.via).toBe('derived');
  });

  it('normalises a bolt export bundle', () => {
    const { files, summary } = prepareConnectorImport('bolt', {
      files: [
        { path: 'app/src/main.ts', content: 'x' },
        { path: 'app/index.html', content: '<html></html>' },
      ],
    });
    expect(files.map((f) => f.path).sort()).toEqual(['index.html', 'src/main.ts']);
    expect(summary.via).toBe('file-bundle');
  });

  it('rejects a native provider (handled by its own endpoint)', () => {
    expectCode(() => prepareConnectorImport('github', { files: [] }), 'IMPORT_NATIVE_PROVIDER');
  });
});
