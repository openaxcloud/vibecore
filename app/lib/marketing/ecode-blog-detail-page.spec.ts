import { Newspaper } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { parseBlogSections, toBlogDetailPageDefinition, type BlogDetailInput } from './ecode-blog-detail-page';

const samplePost: BlogDetailInput = {
  title: 'Introducing E-Code AI Agent 2.0',
  excerpt: 'Our most powerful AI coding assistant yet.',
  content: `# Introducing E-Code AI Agent 2.0

E-Code AI Agent 2.0 is an autonomous software engineer.

## What changed

- Multi-file planning
- Autonomous debugging

## Built for real delivery

The agent creates complete project structures and keeps iterating.`,
  author: 'E-Code Team',
  authorRole: 'Product',
  category: 'Product',
  tags: ['AI', 'agent', 'product'],
  readTime: 5,
  publishedAt: '2026-01-15T00:00:00.000Z',
};

describe('parseBlogSections', () => {
  it('splits content on ## headings and promotes the lead paragraph', () => {
    const sections = parseBlogSections(samplePost.content);

    expect(sections.map((s) => s.title)).toEqual(['Overview', 'What changed', 'Built for real delivery']);
    expect(sections[0].body).toBe('E-Code AI Agent 2.0 is an autonomous software engineer.');
  });

  it('drops the top-level # title heading', () => {
    const sections = parseBlogSections(samplePost.content);
    expect(sections.some((s) => s.title.includes('Introducing E-Code'))).toBe(false);
  });

  it('collects bullet lines as section items', () => {
    const sections = parseBlogSections(samplePost.content);
    const changed = sections.find((s) => s.title === 'What changed');

    expect(changed?.items).toEqual(['Multi-file planning', 'Autonomous debugging']);
  });

  it('collects numbered list lines as section items', () => {
    const sections = parseBlogSections('## Steps\n\n1. Create a workspace.\n2. Describe the app.');
    expect(sections[0].items).toEqual(['Create a workspace.', 'Describe the app.']);
  });

  it('drops empty sections', () => {
    const sections = parseBlogSections('## Empty\n\n## Filled\n\nReal body.');
    expect(sections.map((s) => s.title)).toEqual(['Filled']);
  });
});

describe('toBlogDetailPageDefinition', () => {
  it('maps the post title, excerpt and category into the page definition', () => {
    const page = toBlogDetailPageDefinition(samplePost, Newspaper);

    expect(page.title).toBe('Introducing E-Code AI Agent 2.0');
    expect(page.description).toBe('Our most powerful AI coding assistant yet.');
    expect(page.eyebrow).toBe('Product');
    expect(page.kind).toBe('resource');
    expect(page.icon).toBe(Newspaper);
  });

  it('uses the post tags as highlights, capped at six', () => {
    const page = toBlogDetailPageDefinition({ ...samplePost, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, Newspaper);
    expect(page.highlights).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('falls back to the category when there are no tags', () => {
    const page = toBlogDetailPageDefinition({ ...samplePost, tags: [] }, Newspaper);
    expect(page.highlights).toEqual(['Product']);
  });

  it('links back to the blog index and points the primary action at the docs', () => {
    const page = toBlogDetailPageDefinition(samplePost, Newspaper);

    expect(page.secondaryAction).toEqual(['Back to blog', '/blog']);
    expect(page.primaryAction).toEqual(['Read the docs', '/docs']);
  });

  it('synthesizes an overview section when the content has no headings', () => {
    const page = toBlogDetailPageDefinition({ ...samplePost, content: 'Just a sentence with no headings.' }, Newspaper);

    expect(page.sections).toHaveLength(1);
    expect(page.sections[0].title).toBe('Overview');
  });
});
