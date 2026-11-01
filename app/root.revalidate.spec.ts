import { describe, expect, it } from 'vitest';
import { shouldRevalidateRoot } from './root.revalidate';

const check = (current: string, next: string, formMethod?: 'GET' | 'POST', defaultShouldRevalidate = true) =>
  shouldRevalidateRoot({
    currentUrl: new URL(current, 'https://e-code.ai'),
    nextUrl: new URL(next, 'https://e-code.ai'),
    currentParams: {},
    nextParams: {},
    formMethod,
    defaultShouldRevalidate,
  });

describe('root revalidation during IDE panel navigation', () => {
  it.each(['/projects/p1/ide', '/team/project/ide', '/team/project/ide/'])(
    'commits panel-only navigation without a root request on %s',
    (path) => {
      expect(check(`${path}?panel=files&lang=fr`, `${path}?panel=editor&lang=fr`)).toBe(false);
      expect(check(`${path}`, `${path}?panel=editor`)).toBe(false);
    },
  );

  it.each([
    ['/projects/p1/ide?panel=files', '/projects/p1/ide?panel=files'],
    ['/projects/p1/ide?panel=editor', '/projects/p1/ide?panel=editor'],
    ['/projects/p1/ide?panel=editor', '/projects/p1/ide?panel=files'],
    ['/projects/p1/ide?panel=editor', '/projects/p1/ide'],
    ['/projects/p1/ide?panel=files&lang=en', '/projects/p1/ide?panel=editor&lang=fr'],
    ['/projects/p1/ide?panel=files', '/projects/p2/ide?panel=editor'],
    ['/projects/p1/ide?panel=files', '/dashboard'],
    ['/projects/p1/ide?panel=files', '/projects/p1/ide?panel=editor&commit=abc'],
    ['/settings?panel=files', '/settings?panel=editor'],
    ['/projects/p1/ide?panel=files', 'https://other.example/projects/p1/ide?panel=editor'],
  ])('preserves the router decision for %s → %s', (current, next) => {
    expect(check(current, next)).toBe(true);
    expect(check(current, next, undefined, false)).toBe(false);
  });

  it.each(['GET', 'POST'] as const)('preserves %s submissions even for a panel-only change', (method) => {
    expect(check('/projects/p1/ide?panel=files', '/projects/p1/ide?panel=editor', method)).toBe(true);
  });
});
