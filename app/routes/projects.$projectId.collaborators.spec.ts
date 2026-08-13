import { describe, expect, it } from 'vitest';
import { handleCollaboratorActionError } from '~/lib/collaborator-action-error';

describe('handleCollaboratorActionError', () => {
  it('re-throws redirect Responses (401 → /login) so the browser follows the re-auth navigation', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/login?returnTo=%2F' } });

    await expect(handleCollaboratorActionError(redirect)).rejects.toBe(redirect);
  });

  it('re-throws MFA enrollment redirects (303) instead of rendering them inline', async () => {
    const redirect = new Response(null, { status: 303, headers: { Location: '/mfa-setup' } });

    await expect(handleCollaboratorActionError(redirect)).rejects.toBe(redirect);
  });

  it('surfaces a 404 USER_NOT_FOUND Response as an inline error preserving the status', async () => {
    const apiError = new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });

    const result = (await handleCollaboratorActionError(apiError)) as { data: { error?: string }; init?: ResponseInit };

    expect(result.data.error).toBe('User not found');
    expect(result.init?.status).toBe(404);
  });

  it('surfaces a 403 COLLABORATOR_NOT_ORG_MEMBER Response inline (non-redirect 4xx)', async () => {
    const apiError = new Response(JSON.stringify({ error: 'Not an organization member' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });

    const result = (await handleCollaboratorActionError(apiError)) as { data: { error?: string }; init?: ResponseInit };

    expect(result.data.error).toBe('Not an organization member');
    expect(result.init?.status).toBe(403);
  });

  it('falls back to a friendly message when the error body is not JSON', async () => {
    const apiError = new Response('boom', { status: 500 });

    const result = (await handleCollaboratorActionError(apiError)) as { data: { error?: string }; init?: ResponseInit };

    expect(result.data.error).toBe('Unable to add collaborator. Check the email and try again.');
    expect(result.init?.status).toBe(500);
  });

  it('re-throws non-Response errors to the error boundary', async () => {
    const boom = new Error('unexpected');

    await expect(handleCollaboratorActionError(boom)).rejects.toBe(boom);
  });
});
