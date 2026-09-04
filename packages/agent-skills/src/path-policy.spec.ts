import { describe, expect, it } from 'vitest';

import { resolveSkillResourceLocation, validateSkillResourcePath } from './path-policy.js';

describe('skill resource path policy', () => {
  it.each(['references/REFERENCE.md', 'scripts/extract.py', 'assets/template.json', 'notes.md'])(
    'accepts portable relative resource %s',
    (path) => expect(validateSkillResourcePath(path)).toEqual({ ok: true, path }),
  );

  it.each([
    '../secret',
    'references/../../secret',
    '/etc/passwd',
    '~/.ssh/id_rsa',
    'C:/Windows/system.ini',
    'https://evil.example/payload',
    'references\\secret.md',
    'references/%2e%2e/secret',
    '.git/config',
    '.ssh/id_rsa',
    'node_modules/pkg/index.js',
    '.env',
    'SKILL.md',
    'references/\u202eevil.md',
  ])('rejects unsafe path %s', (path) => {
    expect(validateSkillResourcePath(path).ok).toBe(false);
  });

  it('resolves a validated path under the skill root', () => {
    expect(resolveSkillResourceLocation('.agents/skills/pdf', 'references/api.md')).toEqual({
      ok: true,
      path: '.agents/skills/pdf/references/api.md',
    });
  });
});
