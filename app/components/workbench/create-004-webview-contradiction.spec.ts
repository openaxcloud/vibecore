import { describe, expect, it } from 'vitest';

import { resolvePreviewBootProgress } from './Preview';

/*
 * BUG-CREATE-004 (et son doublon BUG-UX-014) — la Webview affichait « Prêt »
 * avec ses 4 étapes cochées ET, juste en dessous, « le serveur d'aperçu démarre
 * encore ; nouvelle tentative… ». Deux affirmations contradictoires dans le même
 * panneau, et l'état pouvait rester figé là quand aucun serveur ne montait.
 *
 * La cause : l'EXISTENCE d'une entrée d'aperçu était prise pour la preuve que le
 * serveur répond. Le correctif tient entièrement dans l'ORDRE de deux branches —
 * `upstreamNotReady` doit être évalué AVANT `previewsLength > 0`. Un
 * réordonnancement anodin réintroduirait le défaut sans que rien ne le signale.
 * D'où ce test.
 */
const BASE = {
  workspaceReady: true,
  previewsLength: 1,
  isStartingPreview: false,
  isRefreshingPorts: false,
  previewRunFailed: false,
};

describe('BUG-CREATE-004 — la Webview ne dit pas « Prêt » quand elle démarre encore', () => {
  it("une entrée d'aperçu ne suffit PAS à déclarer « prêt » si l'amont ne répond pas", () => {
    const r = resolvePreviewBootProgress({ ...BASE, upstreamNotReady: true });

    expect(r.activeStep, 'la Webview se déclare prête alors que l’amont ne répond pas').not.toBe('ready');
    expect(r.progress).toBeLessThan(100);
  });

  it("l'ordre des branches est le correctif : upstreamNotReady prime sur previewsLength", () => {
    /* Les deux signaux présents en même temps — c'est exactement le cas du bug. */
    const contradictoire = resolvePreviewBootProgress({
      ...BASE,
      previewsLength: 3,
      upstreamNotReady: true,
    });

    expect(contradictoire.activeStep).toBe('server');
    expect(contradictoire.progress).toBe(76);
  });

  it('contre-épreuve : sans signal d’amont en panne, une entrée d’aperçu vaut bien « prêt »', () => {
    const r = resolvePreviewBootProgress({ ...BASE, upstreamNotReady: false });

    expect(r.activeStep).toBe('ready');
    expect(r.progress).toBe(100);
  });

  it('un projet vide dont l’aperçu n’aboutit jamais ne se fige pas sur « prêt »', () => {
    const r = resolvePreviewBootProgress({
      ...BASE,
      previewsLength: 0,
      workspaceReady: false,
      upstreamNotReady: true,
    });

    expect(r.activeStep).not.toBe('ready');
  });
});
