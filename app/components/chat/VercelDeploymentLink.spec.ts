import { describe, expect, it } from 'vitest';
import { parseDeploymentResponse } from './VercelDeploymentLink.client';

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
