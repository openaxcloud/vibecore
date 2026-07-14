import { describe, expect, it } from 'vitest';
import {
  buildEnvVarDiff,
  buildEnvVarRows,
  normalizeEnvVarScope,
  type EnvVarRecord,
} from './projects.$projectId.env.helpers';

describe('normalizeEnvVarScope', () => {
  it('keeps development and preview, defaults everything else to production', () => {
    expect(normalizeEnvVarScope('development')).toBe('development');
    expect(normalizeEnvVarScope('preview')).toBe('preview');
    expect(normalizeEnvVarScope('production')).toBe('production');
    expect(normalizeEnvVarScope(undefined)).toBe('production');
    expect(normalizeEnvVarScope('garbage')).toBe('production');
  });
});

describe('buildEnvVarRows (scoped)', () => {
  it('returns a scope-specific empty placeholder when the scope has no variables', () => {
    const rows = buildEnvVarRows([], 'development');

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('empty');

    if (rows[0].kind === 'empty') {
      expect(rows[0].title.toLowerCase()).toContain('development');
    }
  });

  it('treats an undefined list as empty', () => {
    const rows = buildEnvVarRows(undefined, 'production');

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('empty');
  });

  it('shows ONLY variables in the requested scope (legacy no-scope rows are production)', () => {
    const vars: EnvVarRecord[] = [
      { id: '1', key: 'PROD_ONLY', value: 'p' }, // no scope → production
      { id: '2', key: 'DEV_URL', value: 'http://local', scope: 'development' },
      { id: '3', key: 'PREVIEW_FLAG', value: 'on', scope: 'preview' },
    ];

    expect(buildEnvVarRows(vars, 'development').map((r) => (r.kind === 'var' ? r.key : null))).toEqual(['DEV_URL']);
    expect(buildEnvVarRows(vars, 'preview').map((r) => (r.kind === 'var' ? r.key : null))).toEqual(['PREVIEW_FLAG']);
    expect(buildEnvVarRows(vars, 'production').map((r) => (r.kind === 'var' ? r.key : null))).toEqual(['PROD_ONLY']);
  });

  it('sorts variables by key and carries updatedAt detail', () => {
    const rows = buildEnvVarRows(
      [
        {
          id: '1',
          key: 'VITE_API_URL',
          value: 'https://api',
          scope: 'production',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        { id: '2', key: 'FEATURE_FLAG', value: 'on', scope: 'production' },
      ],
      'production',
    );

    expect(rows.map((r) => (r.kind === 'var' ? r.key : null))).toEqual(['FEATURE_FLAG', 'VITE_API_URL']);

    const flag = rows.find((r) => r.kind === 'var' && r.key === 'FEATURE_FLAG');
    const api = rows.find((r) => r.kind === 'var' && r.key === 'VITE_API_URL');
    expect(flag?.kind === 'var' && flag.detail).toBe('Saved for this project');
    expect(api?.kind === 'var' && api.detail).toContain('Updated');
  });

  it('never produces a variable row without a key', () => {
    for (const row of buildEnvVarRows([], 'production')) {
      expect(row.kind === 'var' && !row.key).toBe(false);
    }
  });
});

describe('buildEnvVarDiff', () => {
  it('flags a key missing from some scope as differing', () => {
    const diff = buildEnvVarDiff([
      { id: '1', key: 'API', value: 'x', scope: 'development' },
      { id: '2', key: 'API', value: 'x', scope: 'preview' },

      // production absent for API
    ]);

    const api = diff.find((r) => r.key === 'API');
    expect(api?.differs).toBe(true);
    expect(api?.values).toEqual({ development: 'x', preview: 'x', production: undefined });
  });

  it('flags a key whose value differs across scopes', () => {
    const diff = buildEnvVarDiff([
      { id: '1', key: 'URL', value: 'http://dev', scope: 'development' },
      { id: '2', key: 'URL', value: 'http://preview', scope: 'preview' },
      { id: '3', key: 'URL', value: 'http://prod', scope: 'production' },
    ]);

    expect(diff.find((r) => r.key === 'URL')?.differs).toBe(true);
  });

  it('does NOT flag a key that is present and identical in all three scopes', () => {
    const diff = buildEnvVarDiff([
      { id: '1', key: 'SAME', value: 'v', scope: 'development' },
      { id: '2', key: 'SAME', value: 'v', scope: 'preview' },
      { id: '3', key: 'SAME', value: 'v', scope: 'production' },
    ]);

    expect(diff.find((r) => r.key === 'SAME')?.differs).toBe(false);
  });

  it('treats a legacy no-scope row as production and is sorted by key', () => {
    const diff = buildEnvVarDiff([
      { id: '1', key: 'ZED', value: '1' }, // → production
      { id: '2', key: 'ALPHA', value: '1', scope: 'development' },
    ]);

    expect(diff.map((r) => r.key)).toEqual(['ALPHA', 'ZED']);
    expect(diff.find((r) => r.key === 'ZED')?.values.production).toBe('1');
  });
});
