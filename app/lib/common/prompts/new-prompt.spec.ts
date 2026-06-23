import { describe, expect, it } from 'vitest';
import { getFineTunedPrompt } from './new-prompt';

describe('getFineTunedPrompt branding', () => {
  it('opens with the E-Code identity, not Bolt/StackBlitz', () => {
    const prompt = getFineTunedPrompt();
    const firstLine = prompt.trimStart().split('\n')[0];

    expect(firstLine).toContain('You are E-Code');
    expect(firstLine).not.toContain('Bolt');
    expect(firstLine).not.toContain('StackBlitz');
  });

  it('does not leak the upstream Bolt/StackBlitz codename in user-facing instruction text', () => {
    const prompt = getFineTunedPrompt();

    /*
     * The literal protocol tags <boltArtifact>/<boltAction> are parser identifiers,
     * not user-facing brand text, so strip them before asserting on prose.
     */
    const withoutProtocolTags = prompt.replace(/boltArtifact|boltAction/g, '');

    expect(withoutProtocolTags).not.toMatch(/Bolt/);
    expect(withoutProtocolTags).not.toMatch(/StackBlitz/i);
  });

  it('keeps the agent self-reference branded as E-Code in instruction prose', () => {
    const prompt = getFineTunedPrompt();

    expect(prompt).toContain('E-Code ALWAYS uses stock photos');
    expect(prompt).toContain('handled by E-Code');
    expect(prompt).toContain('E-Code may create a SINGLE comprehensive artifact');
  });

  it('preserves the boltArtifact/boltAction protocol tags the message parser depends on', () => {
    const prompt = getFineTunedPrompt();

    expect(prompt).toContain('<boltArtifact');
    expect(prompt).toContain('<boltAction');
  });
});
