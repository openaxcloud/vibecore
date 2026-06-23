import { describe, expect, it } from 'vitest';
import { resolveImportActionError } from '~/lib/import-action-error';

const FALLBACK = 'Failed to import zip.';

describe('resolveImportActionError', () => {
  it('rethrows 3xx re-auth redirect responses so the framework can perform the redirect', async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { location: '/login' } });

    expect(await resolveImportActionError(redirectResponse, FALLBACK)).toEqual({ rethrow: true });
  });

  it('surfaces a malformed/oversized archive failure (400/413) inline using the JSON error body', async () => {
    const badRequest = new Response(JSON.stringify({ error: 'Archive is not a valid zip.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

    expect(await resolveImportActionError(badRequest, FALLBACK)).toEqual({
      rethrow: false,
      error: 'Archive is not a valid zip.',
    });

    const tooLarge = new Response(JSON.stringify({ error: 'Archive exceeds the maximum size.' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });

    expect(await resolveImportActionError(tooLarge, FALLBACK)).toEqual({
      rethrow: false,
      error: 'Archive exceeds the maximum size.',
    });
  });

  it('surfaces quota exhaustion (402) inline', async () => {
    const paymentRequired = new Response(JSON.stringify({ error: 'Project quota exceeded.' }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    });

    expect(await resolveImportActionError(paymentRequired, FALLBACK)).toEqual({
      rethrow: false,
      error: 'Project quota exceeded.',
    });
  });

  it('surfaces upstream 500 failures inline instead of crashing to the error boundary', async () => {
    const serverError = new Response(JSON.stringify({ error: 'Import failed unexpectedly.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });

    expect(await resolveImportActionError(serverError, FALLBACK)).toEqual({
      rethrow: false,
      error: 'Import failed unexpectedly.',
    });
  });

  it('falls back to statusText for a non-JSON server error body', async () => {
    const serverError = new Response('boom', { status: 500, statusText: 'Internal Server Error' });

    expect(await resolveImportActionError(serverError, FALLBACK)).toEqual({
      rethrow: false,
      error: 'Internal Server Error',
    });
  });

  it('falls back to the provided message when the API body has no error field', async () => {
    const noBody = new Response(null, { status: 400 });

    expect(await resolveImportActionError(noBody, FALLBACK)).toEqual({
      rethrow: false,
      error: FALLBACK,
    });
  });

  it('rethrows non-Response errors (programmer errors / network throws)', async () => {
    expect(await resolveImportActionError(new Error('boom'), FALLBACK)).toEqual({ rethrow: true });
  });
});
