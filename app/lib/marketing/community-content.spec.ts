import { describe, expect, it } from 'vitest';

import { buildCommunityPostPage, communityPosts, findCommunityPost } from './community-content';

describe('findCommunityPost', () => {
  it('returns the seeded post that matches a known id', () => {
    const post = findCommunityPost('agent-memory-routing-production');

    expect(post).toBeDefined();
    expect(post?.title).toBe('How are teams routing agent memory safely in production?');
    expect(post?.authorName).toBe('Maya Chen');
  });

  it('returns undefined for unknown or missing ids', () => {
    expect(findCommunityPost('does-not-exist')).toBeUndefined();
    expect(findCommunityPost(undefined)).toBeUndefined();
    expect(findCommunityPost('')).toBeUndefined();
  });

  it('resolves every post card target id linked from the community gallery', () => {
    for (const post of communityPosts) {
      expect(findCommunityPost(post.id)).toBe(post);
    }
  });
});

describe('buildCommunityPostPage', () => {
  it('renders the real post title, summary and content instead of a generic placeholder', () => {
    const post = findCommunityPost('deployments-rollback-playbook');
    expect(post).toBeDefined();

    const page = buildCommunityPostPage(post!);

    expect(page.title).toBe(post!.title);
    expect(page.description).toBe(post!.summary);
    expect(page.eyebrow).toBe(post!.categoryName);
    expect(page.slug).toBe('community/post/deployments-rollback-playbook');

    // The actual thread content must appear in a section body, not boilerplate.
    const bodies = page.sections.map((section) => section.body);
    expect(bodies).toContain(post!.content);

    // Author attribution and tags must be surfaced.
    expect(page.highlights).toContain(post!.authorName);
    expect(page.sections.some((section) => section.title.includes(post!.authorName))).toBe(true);
    expect(page.sections.some((section) => section.items.includes('#rollback'))).toBe(true);

    // No fabricated "Continue building" boilerplate from the old placeholder.
    expect(page.sections.some((section) => section.title === 'Continue building')).toBe(false);
  });
});
