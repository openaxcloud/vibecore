import { describe, expect, it } from 'vitest';

import { importEndpointForUrl } from './import-github';

describe('importEndpointForUrl (multi-provider Git import routing)', () => {
  it('routes to the matching per-provider import endpoint by repository host', () => {
    expect(importEndpointForUrl('o1', 'https://github.com/acme/app')).toBe('/orgs/o1/projects/import/github');
    expect(importEndpointForUrl('o1', 'https://gitlab.com/acme/app')).toBe('/orgs/o1/projects/import/gitlab');
    expect(importEndpointForUrl('o1', 'https://bitbucket.org/acme/app')).toBe('/orgs/o1/projects/import/bitbucket');
  });

  it('normalises SSH (git@host:org/repo) before host detection', () => {
    expect(importEndpointForUrl('o1', 'git@gitlab.com:acme/app.git')).toBe('/orgs/o1/projects/import/gitlab');
    expect(importEndpointForUrl('o1', 'git@bitbucket.org:acme/app.git')).toBe('/orgs/o1/projects/import/bitbucket');
  });

  it('defaults unknown/invalid hosts to the GitHub endpoint (still SSRF-validated server-side)', () => {
    expect(importEndpointForUrl('o1', 'not a url')).toBe('/orgs/o1/projects/import/github');
    expect(importEndpointForUrl('o1', 'https://example.com/x/y')).toBe('/orgs/o1/projects/import/github');
  });
});
