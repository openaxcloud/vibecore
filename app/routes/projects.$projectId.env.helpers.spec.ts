import { describe, expect, it } from 'vitest';
import { buildEnvVarRows } from './projects.$projectId.env.helpers';

describe('buildEnvVarRows', () => {
  it('returns a single empty placeholder when there are no variables', () => {
    const rows = buildEnvVarRows([]);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('empty');
  });

  it('treats an undefined list as empty', () => {
    const rows = buildEnvVarRows(undefined);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('empty');
  });

  it('maps each variable to a deletable row carrying its key', () => {
    const rows = buildEnvVarRows([
      { id: '1', key: 'VITE_API_URL', value: 'https://api', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', key: 'FEATURE_FLAG', value: 'on' },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === 'var')).toBe(true);

    const [first, second] = rows;

    if (first.kind !== 'var' || second.kind !== 'var') {
      throw new Error('expected variable rows');
    }

    expect(first.key).toBe('VITE_API_URL');
    expect(first.detail).toContain('Updated');
    expect(second.key).toBe('FEATURE_FLAG');
    expect(second.detail).toBe('Stored in project metadata');
  });

  it('never produces a variable row without a key (so delete can never target the empty state)', () => {
    const rows = buildEnvVarRows([]);

    for (const row of rows) {
      expect(row.kind === 'var' && !row.key).toBe(false);
    }
  });
});
