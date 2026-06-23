import { describe, expect, it } from 'vitest';
import { tutorialHref } from './Tutorials';

describe('tutorialHref', () => {
  it('points every lesson at the canonical /docs page', () => {
    expect(tutorialHref('Deploy to production')).toMatch(/^\/docs#/);
  });

  it('slugifies the title into a stable anchor', () => {
    expect(tutorialHref('Build a full-stack app with the AI agent')).toBe(
      '/docs#build-a-full-stack-app-with-the-ai-agent',
    );
    expect(tutorialHref('Connect a database')).toBe('/docs#connect-a-database');
  });

  it('expands ampersands so anchors stay readable', () => {
    expect(tutorialHref('Git workflows & GitHub sync')).toBe('/docs#git-workflows-and-github-sync');
  });

  it('collapses repeated and trailing separators', () => {
    expect(tutorialHref('  Real-time   collaboration!! ')).toBe('/docs#real-time-collaboration');
  });

  it('falls back to plain /docs when no slug can be derived', () => {
    expect(tutorialHref('   ')).toBe('/docs');
    expect(tutorialHref('!!!')).toBe('/docs');
  });
});
