import { describe, expect, it } from 'vitest';
import { parseDeploymentResponse, parseProjectAliasUrl } from './VercelDeploymentLink.client';

describe('parseDeploymentResponse', () => {
  it('returns the deploy URL when present', () => {
    expect(parseDeploymentResponse({ deploy: { url: 'https://app.vercel.app' } })).toBe('https://app.vercel.app');
  });

  it('prefers the deploy URL over the project URL', () => {
    const data = { deploy: { url: 'https://deploy.vercel.app' }, project: { url: 'https://project.vercel.app' } };
    expect(parseDeploymentResponse(data)).toBe('https://deploy.vercel.app');
  });

  it('falls back to the project URL when no deploy URL exists', () => {
    expect(parseDeploymentResponse({ project: { url: 'https://project.vercel.app' } })).toBe(
      'https://project.vercel.app',
    );
  });

  it('returns null when neither URL is present', () => {
    expect(parseDeploymentResponse({})).toBeNull();
    expect(parseDeploymentResponse({ deploy: {} })).toBeNull();
    expect(parseDeploymentResponse({ project: {} })).toBeNull();
  });

  it('returns null for nullish or malformed bodies', () => {
    expect(parseDeploymentResponse(null)).toBeNull();
    expect(parseDeploymentResponse(undefined)).toBeNull();
    expect(parseDeploymentResponse('not an object')).toBeNull();
  });

  it('ignores non-string URL values', () => {
    expect(parseDeploymentResponse({ deploy: { url: 123 as unknown as string } })).toBeNull();
  });
});

describe('parseProjectAliasUrl', () => {
  it('prefers the clean .vercel.app alias over the -projects.vercel.app form', () => {
    const details = {
      targets: {
        production: {
          alias: ['ecode-foo-projects.vercel.app', 'ecode-foo.vercel.app'],
        },
      },
    };
    expect(parseProjectAliasUrl(details)).toBe('https://ecode-foo.vercel.app');
  });

  it('falls back to the first alias when no clean URL exists', () => {
    const details = {
      targets: {
        production: {
          alias: ['ecode-foo-projects.vercel.app', 'custom.example.com'],
        },
      },
    };
    expect(parseProjectAliasUrl(details)).toBe('https://ecode-foo-projects.vercel.app');
  });

  it('returns null when there are no production aliases', () => {
    expect(parseProjectAliasUrl({ targets: { production: { alias: [] } } })).toBeNull();
    expect(parseProjectAliasUrl({ targets: { production: {} } })).toBeNull();
    expect(parseProjectAliasUrl({ targets: {} })).toBeNull();
    expect(parseProjectAliasUrl({})).toBeNull();
  });

  it('returns null for nullish or malformed details', () => {
    expect(parseProjectAliasUrl(null)).toBeNull();
    expect(parseProjectAliasUrl(undefined)).toBeNull();
    expect(parseProjectAliasUrl('nope')).toBeNull();
  });

  it('ignores non-string alias entries', () => {
    const details = { targets: { production: { alias: [123, null] } } };
    expect(parseProjectAliasUrl(details)).toBeNull();
  });
});
