import { describe, expect, it } from 'vitest';

import { discoverProjectSkills } from './discovery.js';
import { buildAvailableSkillsCatalog, formatAvailableSkillsCatalog } from './prompt.js';
import { AgentSkillRuntime, AgentSkillRuntimeError } from './runtime.js';
import type { DiscoveredAgentSkill } from './types.js';

function discover(body = 'Use the checklist.', description = 'Review code when asked to inspect a diff.') {
  return discoverProjectSkills({
    '.agents/skills/code-review/SKILL.md': {
      type: 'file',
      content: `---
name: code-review
description: ${description}
allowed-tools: Bash(git:*) Read
---
${body}`,
    },
    '.agents/skills/code-review/references/checklist.md': {
      type: 'file',
      content: 'Check behavior, tests, security, and accessibility.',
    },
    '.agents/skills/code-review/assets/logo.png': { type: 'file', content: 'binary', isBinary: true },
  }).skills[0];
}

describe('available skills catalog', () => {
  it('contains only escaped tier-1 metadata and never body or resource content', () => {
    const skill = discover('TOP SECRET BODY', 'Review <unsafe> & "quoted" diffs.');
    const { entries, context } = buildAvailableSkillsCatalog([skill]);

    expect(entries).toHaveLength(1);
    expect(context).toContain('<name>code-review</name>');
    expect(context).toContain('Review &lt;unsafe&gt; &amp; &quot;quoted&quot; diffs.');
    expect(context).toContain('.agents/skills/code-review/SKILL.md');
    expect(context).not.toContain('TOP SECRET BODY');
    expect(context).not.toContain('Check behavior');
    expect(context).not.toContain('Bash(git:*)');
  });

  it('omits unavailable/quarantined skills and omits the whole block when empty', () => {
    const skill = { ...discover(), auditStatus: 'quarantined' as const };
    expect(buildAvailableSkillsCatalog([skill]).context).toBeUndefined();
    expect(formatAvailableSkillsCatalog([])).toBeUndefined();
  });
});

describe('AgentSkillRuntime', () => {
  it('loads instructions only on activation and lists resources without reading them', () => {
    const skill = discover('Run the specialist review.');
    const runtime = new AgentSkillRuntime([skill]);
    const activated = runtime.activate('code-review');

    expect(activated.instructions).toBe('Run the specialist review.');
    expect(activated.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'references/checklist.md', isBinary: false }),
        expect.objectContaining({ path: 'assets/logo.png', isBinary: true }),
      ]),
    );
    expect(activated.declaredAllowedTools).toBe('Bash(git:*) Read');
    expect(activated.grantsToolPermissions).toBe(false);
  });

  it('rehydrates explicit activation for a new provider segment', () => {
    const runtime = new AgentSkillRuntime([discover('Do not duplicate me.')]);
    expect(runtime.activate('code-review').alreadyActivated).toBe(false);
    expect(runtime.activate('code-review')).toMatchObject({
      alreadyActivated: true,
      instructions: 'Do not duplicate me.',
      resources: expect.arrayContaining([expect.objectContaining({ path: 'references/checklist.md' })]),
    });
  });

  it('requires activation then returns only a confined, known, text resource', () => {
    const runtime = new AgentSkillRuntime([discover()]);
    expect(() => runtime.readResource('code-review', 'references/checklist.md')).toThrowError(AgentSkillRuntimeError);
    runtime.activate('code-review');
    expect(runtime.readResource('code-review', 'references/checklist.md')).toEqual({
      skill: 'code-review',
      path: 'references/checklist.md',
      content: 'Check behavior, tests, security, and accessibility.',
      size: 51,
    });
    expect(() => runtime.readResource('code-review', '../secret')).toThrowError(/traversal/i);
    expect(() => runtime.readResource('code-review', 'assets/logo.png')).toThrowError(/binary/i);
  });

  it('does not expose quarantined or revoked skills', () => {
    const base = discover();
    const quarantined: DiscoveredAgentSkill = { ...base, auditStatus: 'quarantined' };
    const revoked: DiscoveredAgentSkill = { ...base, metadata: { ...base.metadata, name: 'revoked' }, auditStatus: 'revoked' };
    const runtime = new AgentSkillRuntime([quarantined, revoked]);
    expect(runtime.names).toEqual([]);
    expect(() => runtime.activate('code-review')).toThrowError(/not available/i);
  });
});
