import { describe, it, expect } from 'vitest';
import { EXAMPLE_PROMPTS } from './ExamplePrompts';

describe('EXAMPLE_PROMPTS', () => {
  it('does not leak the upstream bolt.diy codename in any user-facing prompt', () => {
    for (const prompt of EXAMPLE_PROMPTS) {
      expect(prompt.text.toLowerCase()).not.toContain('bolt.diy');
      expect(prompt.text.toLowerCase()).not.toContain('bolt');
    }
  });

  it('keeps the first prompt as a generic, brand-safe suggestion', () => {
    expect(EXAMPLE_PROMPTS[0].text).toBe('Create a mobile app for tracking workouts');
  });
});
