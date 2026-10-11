import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync(new URL('../../.github/workflows/electron.yml', import.meta.url), 'utf8'));

describe('les builds desktop dépassés ne remplissent plus la file', () => {
  it('regroupe une même proposition en conservant les builds déjà démarrés', () => {
    expect(workflow.concurrency.group).toBe('electron-${{ github.ref }}');
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  });

  it('sépare les propositions et chaque release de tag', () => {
    const group = (ref) => workflow.concurrency.group.replace('${{ github.ref }}', ref);

    expect(group('refs/pull/701/merge')).not.toBe(group('refs/pull/708/merge'));
    expect(group('refs/tags/v1')).not.toBe(group('refs/tags/v2'));
    expect(group('refs/heads/main')).not.toBe(group('refs/tags/v1'));
  });
});
