import { describe, expect, it } from 'vitest';

import { buildScreenshotterApp, type PageRenderer } from './app.js';
import { PageRenderError } from './browser.js';

/*
 * Constaté en réel : le rectangle « vide » d'une carte de projet n'était pas
 * vide. La vignette était bien chargée — son contenu était la PHOTO d'une page
 * d'erreur 404. Le repli « Aucun aperçu » fonctionnait ; c'est ce qui était
 * photographié qui était faux, et c'est la première chose que voit un
 * utilisateur qui revient sur son tableau de bord.
 *
 * Cause : `page.goto()` rend la réponse du document principal, et cette réponse
 * était ignorée — le rendu se poursuivait quel que soit le statut.
 *
 * Ces tests portent sur le CONTRAT du service : un refus et une panne ne se
 * répondent pas de la même façon, sans quoi l'astreinte reçoit une alerte pour
 * chaque aperçu qui n'existe pas encore.
 */

const ALLOWED = { allowedHostSuffixes: ['preview.e-code.ai'] };
const URL_OK = 'https://ws-1.preview.e-code.ai/';

function rendererThrowing(error: Error): PageRenderer {
  return {
    async render() {
      throw error;
    },
  };
}

async function capture(renderer: PageRenderer) {
  const app = await buildScreenshotterApp({ renderer, ...ALLOWED });
  const res = await app.inject({ method: 'POST', url: '/capture', payload: { url: URL_OK, projectId: 'p1' } });

  await app.close();

  return res;
}

describe('screenshotter — pages d’erreur', () => {
  it('refuse une page 404 avec un code distinct, pas un 502 de panne', async () => {
    const res = await capture(
      rendererThrowing(new PageRenderError('refusing to capture an error page (HTTP 404)', 404)),
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('TARGET_PAGE_ERROR');
  });

  it('refuse aussi une page 500 de l’aperçu', async () => {
    const res = await capture(
      rendererThrowing(new PageRenderError('refusing to capture an error page (HTTP 500)', 500)),
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('TARGET_PAGE_ERROR');
  });

  it('une VRAIE panne de rendu reste un 502', async () => {
    /*
     * Un plantage du navigateur n'est pas la même chose qu'une page absente :
     * les confondre masque les pannes au milieu du bruit.
     */
    const res = await capture(rendererThrowing(new Error('browser crashed')));

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('render failed');
  });

  it('PageRenderError porte le statut, pour journaliser sans alerter', () => {
    const error = new PageRenderError('refusing to capture an error page (HTTP 404)', 404);

    expect(error.httpStatus).toBe(404);
    expect(error.name).toBe('PageRenderError');
    expect(error).toBeInstanceOf(Error);
  });
});
