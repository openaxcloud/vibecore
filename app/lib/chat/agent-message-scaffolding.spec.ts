import { describe, expect, it } from 'vitest';
import { stripInternalAgentScaffolding } from './agent-message-scaffolding';

describe('stripInternalAgentScaffolding', () => {
  it('removes the <vibecore_agent_request> guardrail wrapper, keeping the real message', () => {
    const raw = [
      '<vibecore_agent_request>',
      '- Mode: Agent. Runs the task end to end.',
      '- Plan first is disabled: proceed according to the selected mode.',
      '- Diff review is enforced by the IDE.',
      '</vibecore_agent_request>',
      '',
      'Build me a todo app.',
    ].join('\n');

    expect(stripInternalAgentScaffolding(raw)).toBe('Build me a todo app.');
  });

  it('strips any vibecore_* internal wrapper (matched open/close), leaving other content', () => {
    expect(stripInternalAgentScaffolding('<vibecore_context>files</vibecore_context>\n\nHello')).toBe('Hello');
    expect(stripInternalAgentScaffolding('before <vibecore_x>y</vibecore_x> after')).toBe('before after');
  });

  it('does not touch messages without an internal wrapper (incl. lookalikes)', () => {
    expect(stripInternalAgentScaffolding('Just a normal message')).toBe('Just a normal message');

    // Mismatched / non-vibecore tags are left alone.
    expect(stripInternalAgentScaffolding('use <div>x</div> please')).toBe('use <div>x</div> please');
    expect(stripInternalAgentScaffolding('<vibecore_open>no close tag here')).toBe('<vibecore_open>no close tag here');
  });

  it('is safe on empty input', () => {
    expect(stripInternalAgentScaffolding('')).toBe('');
  });
});
