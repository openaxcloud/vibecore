import { describe, expect, it } from 'vitest';

import { buildCommunityCategories } from './ecode-public-runtime.server';

describe('buildCommunityCategories', () => {
  const templates = [
    { category: 'web' },
    { category: 'web' },
    { category: 'web' },
    { category: 'api' },
    { category: 'api' },
    { category: 'ml-ai' },
    { category: 'mobile' },
    { category: 'starter' },
  ];

  it('counts posts using the real catalog category keys', () => {
    const categories = buildCommunityCategories(templates);
    const byId = Object.fromEntries(categories.map((c) => [c.id, c.postCount]));

    expect(byId.showcase).toBe(templates.length);
    expect(byId.tutorials).toBe(3); // counts.web
    expect(byId.challenges).toBe(1); // counts['ml-ai'] (previously read counts.ai → always 0)
    expect(byId.discussion).toBe(2); // counts.api (previously read counts.backend → always 0)
  });

  it('does not regress to the non-existent ai/backend keys (challenges/discussion would be 0)', () => {
    /*
     * A catalog with ml-ai and api templates but no literal 'ai'/'backend' keys
     * must still produce non-zero challenge/discussion counts.
     */
    const categories = buildCommunityCategories([{ category: 'ml-ai' }, { category: 'api' }]);
    const challenges = categories.find((c) => c.id === 'challenges');
    const discussion = categories.find((c) => c.id === 'discussion');

    expect(challenges?.postCount).toBe(1);
    expect(discussion?.postCount).toBe(1);
  });

  it('defaults missing categories to 0', () => {
    const categories = buildCommunityCategories([{ category: 'web' }]);
    const byId = Object.fromEntries(categories.map((c) => [c.id, c.postCount]));

    expect(byId.tutorials).toBe(1);
    expect(byId.challenges).toBe(0);
    expect(byId.discussion).toBe(0);
  });
});
