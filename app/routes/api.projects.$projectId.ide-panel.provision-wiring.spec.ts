import { describe, expect, it, vi } from 'vitest';

/*
 * BUG-DB-PANEL-001 — le CÂBLAGE, que #145 n'avait pas couvert.
 *
 * #145 a bien ajouté `actionablePanelFailure`, mais son spec ne testait que ce
 * helper pur : `actionablePanelFailure(corpsAmont)`. Rien ne vérifiait que la
 * route l'appelle pour de vrai, ni ce qu'elle finit par renvoyer — or c'est là
 * que se joue « le panneau disparaît ou non ».
 *
 * Ce test-ci passe par `action()`, avec l'amont simulé exactement comme
 * `apiRequest` le lève : une `Response` JSON reconstruite portant `code`.
 *
 * L'invariant tenu : une provision qui échoue est RENVOYÉE, jamais LEVÉE. Une
 * levée devient une `ErrorResponse` single-fetch, donc l'ErrorBoundary de la
 * route — c'est-à-dire l'IDE remplacé par une page d'erreur, ce qu'ont vu les
 * utilisateurs (`[data-panel="database"]` absent du DOM).
 */
const CORPS_AMONT = {
  ok: false,
  error: 'The managed database could not be provisioned, so nothing was created.',
  code: 'DATABASE_PROVISION_UNAVAILABLE',
};

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();

  return {
    ...reel,
    apiRequest: vi.fn(async () => {
      throw new Response(JSON.stringify(CORPS_AMONT), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }),
  };
});

const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

function requetePanneau(intent: string) {
  return new Request('https://exemple.test/api/projects/p1/ide-panel/database', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intent }),
  });
}

async function lancer(intent: string) {
  try {
    return {
      renvoye: await action({
        request: requetePanneau(intent),
        params: { projectId: 'p1', panel: 'database' },
      } as never),
    };
  } catch (leve) {
    return { leve };
  }
}

describe('provision de base de données : la route renvoie l’échec au lieu de le lever', () => {
  it('ne lève pas — sinon le panneau est démonté par l’ErrorBoundary', async () => {
    const { leve } = await lancer('provision');

    expect(leve).toBeUndefined();
  });

  it('conserve le code amont, au lieu du fourre-tout PANEL_REQUEST_FAILED', async () => {
    const { renvoye } = await lancer('provision');
    const charge = JSON.stringify(renvoye);

    expect(charge).toContain('DATABASE_PROVISION_UNAVAILABLE');
    expect(charge).not.toContain('PANEL_REQUEST_FAILED');
  });

  it('marque l’échec pour que le panneau rende son état d’erreur', async () => {
    const { renvoye } = await lancer('provision');

    expect(JSON.stringify(renvoye)).toContain('"ok":false');
  });
});
