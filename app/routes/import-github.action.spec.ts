import { afterEach, describe, expect, it, vi } from 'vitest';
import { action } from './import-github';
import { getImportRoutesCopy } from '~/lib/i18n/catalogs/import-routes';

/*
 * Regression: the GitHub-import action called apiRequest with no try/catch.
 * apiRequest throws a real `Response` (jsonResponse) on every non-ok status
 * (except a redirected 401/MFA). So a real import failure — invalid / private /
 * missing repo (400/404), quota exceeded (402), or upstream 500 — bubbled out
 * of the action and was rendered by the route error boundary as a generic crash
 * page, never reaching the inline `{actionData?.error}` slot in the form.
 *
 * The action must now surface stable, localizable error codes inline without
 * leaking upstream text, and only re-throw re-auth responses so the framework
 * follows them.
 *
 * These tests drive the real action with a stubbed global fetch (a standard
 * test double, no module mocks): the first call resolves the user's org via
 * /orgs, the second is the import call whose response we control.
 */

const ORG = { id: 'org-1', name: 'Acme', slug: 'acme' };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function importRequest(repositoryUrl: string | undefined = 'https://github.com/org/repo') {
  const form = new URLSearchParams();

  if (repositoryUrl !== undefined) {
    form.set('repositoryUrl', repositoryUrl);
  }

  return new Request('https://app.example.com/import-github', {
    method: 'POST',
    headers: {
      cookie: 'ecode_session=test-token',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
}

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

/**
 * Build a global fetch double: first /orgs lookup, then the import POST whose
 * Response is `importResponse`.
 */
function stubFetch(importResponse: Response) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/orgs')) {
      return jsonResponse(200, { organizations: [ORG] });
    }

    if (url.includes('/projects/import/github')) {
      return importResponse;
    }

    throw new Error(`unexpected fetch to ${url}`);
  });
}

/**
 * Le `fetch` de l'import ABANDONNE au lieu de répondre — la forme exacte que
 * rend `AbortSignal.timeout` (mesurée le 2026-09-10 : `DOMException`,
 * `name: 'TimeoutError'`).
 */
function stubFetchQuiAbandonne() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/orgs')) {
      return jsonResponse(200, { organizations: [ORG] });
    }

    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('import-github action error handling', () => {
  it('returns an inline error (not a thrown Response) when the repo is invalid (400)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(400, { ok: false, error: 'Repository URL is not a valid GitHub repo.' }));

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'inaccessible' });
    expect(JSON.stringify(readData(result))).not.toContain('not a valid GitHub repo');
  });

  it('returns an inline error when the repo is missing/private (404)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(404, { ok: false, error: 'Repository not found or is private.' }));

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'inaccessible' });
    expect(JSON.stringify(readData(result))).not.toContain('not found or is private');
  });

  it('returns an inline error when the project quota is exceeded (402)', async () => {
    globalThis.fetch = stubFetch(jsonResponse(402, { ok: false, error: 'Project limit reached for this plan.' }));

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'quota' });
    expect(JSON.stringify(readData(result))).not.toContain('Project limit reached');
  });

  it('returns a safe inline code on an upstream 500', async () => {
    globalThis.fetch = stubFetch(new Response('upstream boom', { status: 500 }));

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'importFailed' });
    expect(JSON.stringify(readData(result))).not.toContain('upstream boom');
  });

  /*
   * BUG-CREATE-005 — « l'import GitHub échoue au bout de 3 minutes sur un
   * message générique ». Le serveur classe désormais l'échec de clone
   * (`services/api/src/import-echec.ts`) ; ces deux cas vérifient que le client
   * LIT ce classement. Sans eux, un 504 et un 502 retombaient tous deux dans
   * `importFailed` — « Réessayez. » — et le travail serveur ne changeait rien
   * pour l'utilisateur (règle 10 : vérifier l'existence de ce qu'on croit
   * protéger).
   */
  it('un clone qui dépasse le délai (504) ne dit plus « réessayez »', async () => {
    globalThis.fetch = stubFetch(
      jsonResponse(504, { ok: false, code: 'IMPORT_CLONE_TIMEOUT', error: 'clone timed out' }),
    );

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'timeout' });
    expect(JSON.stringify(readData(result))).not.toContain('clone timed out');
  });

  it('un hébergeur injoignable (502) est annoncé comme tel, pas comme un échec du dépôt', async () => {
    globalThis.fetch = stubFetch(
      jsonResponse(502, { ok: false, code: 'IMPORT_UPSTREAM_UNREACHABLE', error: 'upstream unreachable' }),
    );

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'upstream' });
    expect(JSON.stringify(readData(result))).not.toContain('upstream unreachable');
  });

  it('chaque code rendu par l’action a une phrase dans les DEUX langues', async () => {
    /*
     * Règle 15 : un code sans phrase rend une chaîne vide dans le `<p role=
     * "alert">` du formulaire — l'utilisateur voit alors un encart vide, ce qui
     * est pire que le message générique qu'on remplace.
     */
    const en = getImportRoutesCopy('en');
    const fr = getImportRoutesCopy('fr');

    for (const code of ['urlRequired', 'inaccessible', 'quota', 'timeout', 'upstream', 'importFailed'] as const) {
      expect(en[`importRoutes.git.error.${code}`], `en/${code}`).toBeTruthy();
      expect(fr[`importRoutes.git.error.${code}`], `fr/${code}`).toBeTruthy();
    }

    /* Les trois causes doivent être DISTINGUABLES : trois phrases différentes. */
    const phrases = new Set(
      (['inaccessible', 'timeout', 'upstream', 'importFailed'] as const).map(
        (code) => fr[`importRoutes.git.error.${code}`],
      ),
    );
    expect(phrases.size).toBe(4);
  });

  /*
   * BUG-CREATE-005, LE CHEMIN RÉEL (règle 1). Les deux cas ci-dessus décrivent
   * un serveur qui RÉPOND. Ce qui se passait en vrai est plus bête : le client
   * raccrochait le premier. `apiRequest` impose `AbortSignal.timeout(30_000)`
   * par défaut, le serveur s'autorise 120 s pour cloner — et un abandon de
   * `fetch` n'est pas une `Response`, donc aucune branche `isApiResponse` ne
   * l'attrapait. On tombait sur `actionError('importFailed', 500)` : très
   * exactement le `500` + « Réessayez. » relevé à l'inventaire.
   */
  it('un abandon côté client ne se déguise plus en « Réessayez »', async () => {
    globalThis.fetch = stubFetchQuiAbandonne();

    const result = await action({ request: importRequest() } as never);

    expect(readData(result)).toEqual({ errorCode: 'timeout' });
  });

  it('re-throws a 3xx re-auth redirect so the framework follows it', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fimport-github' },
    });
    globalThis.fetch = stubFetch(redirectResponse);

    await expect(action({ request: importRequest() } as never)).rejects.toMatchObject({ status: 302 });
  });

  it('still validates the empty-URL case inline without hitting the API', async () => {
    const fetchSpy = stubFetch(jsonResponse(200, { project: { id: 'p1' } }));
    globalThis.fetch = fetchSpy;

    const result = await action({ request: importRequest('') } as never);

    expect(readData(result)).toEqual({ errorCode: 'urlRequired' });

    // Validation runs before either the organization lookup or import request.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/projects/import/github'))).toBe(false);
  });
});
