import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { classifyResource, loadSkillFromFiles, parseSkillManifest } from './skill-manifest.js';

const realSkillUrl = new URL('../../../.agents/skills/commit-helper/SKILL.md', import.meta.url);
const realReferenceUrl = new URL(
  '../../../.agents/skills/commit-helper/references/conventional-commits.md',
  import.meta.url,
);

describe('parseSkillManifest', () => {
  it('parses the real shipped commit-helper skill (interop format)', () => {
    const text = readFileSync(fileURLToPath(realSkillUrl), 'utf8');
    const result = parseSkillManifest(text, { expectedName: 'commit-helper' });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.manifest.name).toBe('commit-helper');
    expect(result.manifest.description).toMatch(/Conventional Commits/i);
    expect(result.manifest.license).toBe('MIT');
    expect(result.manifest.allowedTools).toEqual(['Bash', 'Read']);
    expect(result.manifest.metadata.version).toBe('1.0.0');
    expect(result.manifest.metadata.author).toBe('E-Code');
    expect(result.manifest.body).toMatch(/Conventional Commits format/);
  });

  it('requires a frontmatter block', () => {
    const result = parseSkillManifest('# just a heading\n\nno frontmatter here');
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/frontmatter/i);
    }
  });

  it('rejects a missing name', () => {
    const result = parseSkillManifest('---\ndescription: something\n---\n\nbody');
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/name/);
    }
  });

  it('rejects a missing description', () => {
    const result = parseSkillManifest('---\nname: thing\n---\n\nbody');
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/description/);
    }
  });

  it('rejects an invalid name (uppercase / spaces)', () => {
    const result = parseSkillManifest('---\nname: Bad Name\ndescription: d\n---\n\nbody');
    expect(result.ok).toBe(false);
  });

  it('enforces name == directory name', () => {
    const result = parseSkillManifest('---\nname: other\ndescription: d\n---\n\nbody', {
      expectedName: 'commit-helper',
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/must match the skill directory/);
    }
  });

  it('rejects an empty body', () => {
    const result = parseSkillManifest('---\nname: thing\ndescription: d\n---\n');
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/no instructions body/);
    }
  });

  it('rejects tabs and unknown YAML shapes (strict subset)', () => {
    expect(parseSkillManifest('---\nname:\tthing\ndescription: d\n---\n\nbody').ok).toBe(false);
    expect(parseSkillManifest('---\nname: &anchor thing\ndescription: d\n---\n\nbody').ok).toBe(false);
  });

  it('parses both flow and block string lists for allowed-tools', () => {
    const flow = parseSkillManifest('---\nname: t\ndescription: d\nallowed-tools: [Bash, Read]\n---\n\nbody');
    const block = parseSkillManifest('---\nname: t\ndescription: d\nallowed-tools:\n  - Bash\n  - Read\n---\n\nbody');

    expect(flow.ok && flow.manifest.allowedTools).toEqual(['Bash', 'Read']);
    expect(block.ok && block.manifest.allowedTools).toEqual(['Bash', 'Read']);
  });
});

describe('classifyResource', () => {
  it('classifies by directory then extension', () => {
    expect(classifyResource('references/api.md')).toBe('reference');
    expect(classifyResource('scripts/build.sh')).toBe('script');
    expect(classifyResource('helper.py')).toBe('script');
    expect(classifyResource('assets/logo.png')).toBe('asset');
    expect(classifyResource('data.csv')).toBe('asset');
    expect(classifyResource('NOTES.txt')).toBe('other');
  });
});

describe('loadSkillFromFiles', () => {
  it('assembles the manifest plus its L3 resources from the real skill dir', () => {
    const skillText = readFileSync(fileURLToPath(realSkillUrl), 'utf8');
    const refText = readFileSync(fileURLToPath(realReferenceUrl), 'utf8');

    const result = loadSkillFromFiles('commit-helper', [
      { path: 'SKILL.md', content: skillText },
      { path: 'references/conventional-commits.md', content: refText },
    ]);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.manifest.resources).toHaveLength(1);
    expect(result.manifest.resources[0]).toMatchObject({
      path: 'references/conventional-commits.md',
      kind: 'reference',
    });
    expect(result.manifest.resources[0].bytes).toBeGreaterThan(0);
  });

  it('fails when SKILL.md is absent', () => {
    const result = loadSkillFromFiles('thing', [{ path: 'references/x.md', content: 'x' }]);
    expect(result.ok).toBe(false);
  });
});
