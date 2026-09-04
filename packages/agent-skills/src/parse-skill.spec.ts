import { describe, expect, it } from 'vitest';

import { parseAgentSkill } from './parse-skill.js';

const location = '.agents/skills/code-review/SKILL.md';
const parse = (source: string, directoryName = 'code-review') =>
  parseAgentSkill(source, { directoryName, location: `.agents/skills/${directoryName}/SKILL.md` });

describe('parseAgentSkill', () => {
  it('parses every standard frontmatter field and the markdown body', () => {
    const result = parse(`---
name: code-review
description: Review code and explain risks. Use for pull requests and diffs.
license: Apache-2.0
compatibility: Requires git 2.40+
metadata:
  author: vibecore
  version: "1.2"
allowed-tools: Bash(git:*) Read
---
# Workflow

Review the diff.`);

    expect(result.diagnostics).toEqual([]);
    expect(result.skill).toEqual({
      metadata: {
        name: 'code-review',
        description: 'Review code and explain risks. Use for pull requests and diffs.',
        license: 'Apache-2.0',
        compatibility: 'Requires git 2.40+',
        metadata: { author: 'vibecore', version: '1.2' },
        allowedTools: 'Bash(git:*) Read',
      },
      body: '# Workflow\n\nReview the diff.',
      location,
      root: '.agents/skills/code-review',
    });
  });

  it('accepts YAML block descriptions and an empty body with a warning', () => {
    const result = parse(`---
name: code-review
description: >
  Review changes and security risks.
  Use when inspecting a diff.
---`);

    expect(result.skill?.metadata.description).toContain('Use when inspecting a diff.');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'skill.empty-body', severity: 'warning' }));
  });

  it.each([
    ['', 'frontmatter.missing-opening-delimiter'],
    ['---\nname: code-review', 'frontmatter.missing-closing-delimiter'],
    ['---\ndescription: use it\n---\nbody', 'frontmatter.missing-field'],
    ['---\nname: code-review\n---\nbody', 'frontmatter.missing-field'],
  ])('rejects incomplete input', (source, code) => {
    const result = parse(source);
    expect(result.skill).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
  });

  it.each(['Code-Review', '-code-review', 'code-review-', 'code--review', 'code_review']) (
    'rejects invalid standard name %s',
    (name) => {
      const result = parse(`---\nname: ${name}\ndescription: Review code.\n---\nBody`);
      expect(result.skill).toBeUndefined();
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'frontmatter.invalid-name' }));
    },
  );

  it('requires name to match the parent directory', () => {
    const result = parse(`---\nname: testing\ndescription: Run tests.\n---\nBody`);
    expect(result.skill).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'frontmatter.name-directory-mismatch' }),
    );
  });

  it('rejects duplicate keys, aliases, and non-string metadata values', () => {
    const duplicate = parse(`---
name: code-review
name: code-review
description: Review code.
---
Body`);
    expect(duplicate.diagnostics).toContainEqual(expect.objectContaining({ code: 'frontmatter.invalid-yaml' }));

    const alias = parse(`---
name: &name code-review
description: *name
---
Body`);
    expect(alias.skill).toBeUndefined();
    expect(alias.diagnostics).toContainEqual(expect.objectContaining({ code: 'frontmatter.anchors-forbidden' }));

    const metadata = parse(`---
name: code-review
description: Review code.
metadata:
  version: 2
---
Body`);
    expect(metadata.skill).toBeUndefined();
    expect(metadata.diagnostics).toContainEqual(expect.objectContaining({ code: 'frontmatter.invalid-metadata-entry' }));
  });

  it('enforces description and compatibility limits', () => {
    const result = parse(`---
name: code-review
description: ${'x'.repeat(1025)}
compatibility: ${'y'.repeat(501)}
---
Body`);
    expect(result.skill).toBeUndefined();
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'frontmatter.field-too-long')).toHaveLength(2);
  });

  it('warns and ignores extension fields without exposing them to the agent', () => {
    const result = parse(`---
name: code-review
description: Review code.
disable-model-invocation: true
---
Body`);
    expect(result.skill).toBeDefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'frontmatter.unknown-field' }));
    expect(result.skill?.metadata).not.toHaveProperty('disable-model-invocation');
  });

  it('bounds the complete SKILL.md before YAML parsing', () => {
    const result = parseAgentSkill('x'.repeat(101), { directoryName: 'code-review', location, maxCharacters: 100 });
    expect(result.skill).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'skill.file-too-large' }));
  });
});
