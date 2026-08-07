import { describe, expect, it } from 'vitest';

import { buildCommunityCategories, communityPostCategory } from './ecode-public-runtime.server';

describe('communityPostCategory', () => {
  it('cycles posts through showcase/tutorials/discussion and never challenges', () => {
    const assigned = Array.from({ length: 9 }, (_v, index) => communityPostCategory(index));

    expect(assigned).toEqual([
      'showcase',
      'tutorials',
      'discussion',
      'showcase',
      'tutorials',
      'discussion',
      'showcase',
      'tutorials',
      'discussion',
    ]);
    expect(assigned).not.toContain('challenges');
  });
});

describe('buildCommunityCategories', () => {
  /*
   * The catalog category values ('web'/'api'/'ml-ai'/...) are irrelevant to the
   * community badges — only the post→category assignment (communityPostCategory,
   * cycling index % 3) decides which posts a ?category= request returns. The
   * badge counts must mirror that assignment so a tab never advertises posts it
   * cannot serve.
   */
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

  it('derives every badge count from the real post→category assignment', () => {
    const categories = buildCommunityCategories(templates);
    const byId = Object.fromEntries(categories.map((c) => [c.id, c.postCount]));

    // 8 templates, index % 3 → showcase: 0,3,6 (3); tutorials: 1,4,7 (3); discussion: 2,5 (2).
    expect(byId.showcase).toBe(3);
    expect(byId.tutorials).toBe(3);
    expect(byId.discussion).toBe(2);
  });

  it('reports Challenges as 0 because no post is ever assigned that category', () => {
    const challenges = buildCommunityCategories(templates).find((c) => c.id === 'challenges');

    // Honest empty badge: the Challenges tab filters to zero posts, so it must advertise zero.
    expect(challenges?.postCount).toBe(0);
  });

  it('keeps each badge count consistent with the number of posts that category filter returns', () => {
    const categories = buildCommunityCategories(templates);
    const byId = Object.fromEntries(categories.map((c) => [c.id, c.postCount]));

    // Recompute the actual post counts the loader would produce per category.
    const actual = templates.reduce<Record<string, number>>((acc, _t, index) => {
      const category = communityPostCategory(index);
      acc[category] = (acc[category] ?? 0) + 1;

      return acc;
    }, {});

    for (const category of categories) {
      expect(category.postCount).toBe(actual[category.id] ?? 0);
    }

    // Sanity: advertised total never exceeds the number of posts.
    const advertisedTotal = Object.values(byId).reduce((sum, n) => sum + n, 0);
    expect(advertisedTotal).toBe(templates.length);
  });

  it('handles an empty catalog with all-zero badges', () => {
    const categories = buildCommunityCategories([]);

    for (const category of categories) {
      expect(category.postCount).toBe(0);
    }
  });

  it('localizes category labels without changing stable ids or computed counts', () => {
    const english = buildCommunityCategories(templates, 'en');
    const french = buildCommunityCategories(templates, 'fr');

    expect(french.map(({ id, name, postCount }) => ({ id, name, postCount }))).toEqual([
      { id: 'showcase', name: 'Réalisations', postCount: 3 },
      { id: 'tutorials', name: 'Tutoriels', postCount: 3 },
      { id: 'challenges', name: 'Défis', postCount: 0 },
      { id: 'discussion', name: 'Discussions', postCount: 2 },
    ]);
    expect(french.map((category) => category.id)).toEqual(english.map((category) => category.id));
    expect(french.map((category) => category.postCount)).toEqual(english.map((category) => category.postCount));
  });
});
