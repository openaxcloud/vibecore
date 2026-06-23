import { describe, it, expect } from 'vitest';
import { discussPrompt } from './discuss-prompt';

describe('discussPrompt', () => {
  const prompt = discussPrompt();

  it('does not leak upstream Bolt support URLs into the user-facing prompt', () => {
    expect(prompt).not.toContain('support.bolt.new');
    expect(prompt).not.toContain('Bolt support resources');
  });

  it('does not force a mandatory redirect that refuses to answer support topics', () => {
    // The old rule 9 mandated redirecting users to external docs and never answering.
    expect(prompt).not.toContain('NEVER attempt to answer the question');
    expect(prompt).not.toContain('always redirect to the official documentation');
  });

  it('instructs the assistant to answer support topics directly', () => {
    expect(prompt).toContain('answer the question directly');

    // The support_resources block is retained as topic context, not a redirect list.
    expect(prompt).toContain('<support_resources>');
    expect(prompt).toContain('answering the question yourself is REQUIRED');
  });
});
