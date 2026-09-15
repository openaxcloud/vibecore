import { describe, expect, it } from 'vitest';
import { isAllowedByRobots, parseRobotsTxt } from './robots-txt';

describe('robots.txt', () => {
  const file = `
# comment
User-agent: *
Disallow: /admin/
Disallow: /private
Allow: /private/public
Disallow: /*.pdf$
Disallow: /tmp/*/x

User-agent: E-CodeBot
Disallow: /bot-only

User-agent: Googlebot
User-agent: Bingbot
Disallow: /
`;

  it('applies the wildcard group when no group names our token', () => {
    const rules = parseRobotsTxt(file, 'other-bot');

    expect(isAllowedByRobots(rules, 'https://a.io/')).toBe(true);
    expect(isAllowedByRobots(rules, 'https://a.io/admin/x')).toBe(false);
    expect(isAllowedByRobots(rules, 'https://a.io/private-stuff')).toBe(false);
    expect(isAllowedByRobots(rules, 'https://a.io/private/public/page')).toBe(true); // longest match: Allow
    expect(isAllowedByRobots(rules, 'https://a.io/doc.pdf')).toBe(false); // $ anchor
    expect(isAllowedByRobots(rules, 'https://a.io/doc.pdf?x=1')).toBe(true);
    expect(isAllowedByRobots(rules, 'https://a.io/tmp/a/x')).toBe(false); // * wildcard
    expect(isAllowedByRobots(rules, 'https://a.io/tmp/a/b/x')).toBe(false); // * spans slashes (REP)
    expect(isAllowedByRobots(rules, 'https://a.io/tmp/a/y')).toBe(true);
  });

  it('prefers the group naming our token over *, and shared-agent groups collect all rules', () => {
    const ours = parseRobotsTxt(file);

    expect(isAllowedByRobots(ours, 'https://a.io/bot-only')).toBe(false);
    expect(isAllowedByRobots(ours, 'https://a.io/admin/x')).toBe(true); // the * group no longer applies

    const bing = parseRobotsTxt(file, 'bingbot');

    expect(isAllowedByRobots(bing, 'https://a.io/anything')).toBe(false);
  });

  it('allows everything on an empty, unparseable or Disallow-less file', () => {
    expect(isAllowedByRobots(parseRobotsTxt(''), 'https://a.io/x')).toBe(true);
    expect(isAllowedByRobots(parseRobotsTxt('garbage without colons'), 'https://a.io/x')).toBe(true);
    expect(isAllowedByRobots(parseRobotsTxt('User-agent: *\nDisallow:'), 'https://a.io/x')).toBe(true);
  });

  it('rejects unparseable URLs', () => {
    expect(isAllowedByRobots(parseRobotsTxt(''), 'not a url')).toBe(false);
  });
});
