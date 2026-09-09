import { describe, expect, it } from 'vitest';
import { shouldShowStartupOverlay } from './Preview';

const base = {
  hasActivePreview: false,
  hasStaticPreview: false,
  autoStart: true,
  previewRunFailed: false,
  hasWorkspaceError: false,
  isStartingPreview: true,
  isRefreshingPorts: false,
  workspaceReady: false,
  previewStatus: 'Starting project workspace…' as string | undefined,
};

describe('shouldShowStartupOverlay', () => {
  it('shows the boot overlay while the workspace is starting normally', () => {
    expect(shouldShowStartupOverlay(base)).toBe(true);
  });

  it('does NOT show the perpetual spinner once a workspace boot error is set (renders the error UI instead)', () => {
    /*
     * The core fix: a boot error leaves workspaceReady false forever — without this
     * the overlay spun indefinitely with no error and no recovery.
     */
    expect(shouldShowStartupOverlay({ ...base, hasWorkspaceError: true })).toBe(false);
  });

  it('does NOT show the spinner when the preview run already failed (error UI handles it)', () => {
    expect(shouldShowStartupOverlay({ ...base, previewRunFailed: true })).toBe(false);
  });

  it('does not show the overlay once a live preview exists', () => {
    expect(shouldShowStartupOverlay({ ...base, hasActivePreview: true })).toBe(false);
  });

  it('does not show the overlay when autoStart is off', () => {
    expect(shouldShowStartupOverlay({ ...base, autoStart: false })).toBe(false);
  });
});

/*
 * BUG-PREVIEW-REMOUNT-001 — Avi, 09/09 : l'application s'affichait, il change
 * d'onglet, il revient, et l'écran de démarrage en quatre étapes recommence.
 * « on va pas l'app fixe ».
 *
 * L'état RECONSTITUÉ depuis sa capture est celui-ci, et c'est ce qui rend ce
 * test utile : les trois premières étapes sont cochées, l'espace de travail
 * est PRÊT, aucun démarrage n'est en cours — et pourtant l'écran revenait,
 * parce que la perte passagère de l'URL du cadre reposait `previewStatus`.
 */
const auRetourDOnglet = {
  hasActivePreview: false,
  hasStaticPreview: false,
  autoStart: true,
  previewRunFailed: false,
  hasWorkspaceError: false,
  isStartingPreview: false,
  isRefreshingPorts: false,
  workspaceReady: true,
  previewStatus: 'Chargement de la webview et attente du premier rendu…' as string | undefined,
};

describe('shouldShowStartupOverlay — réadoption après un aller-retour d’onglet', () => {
  it('TÉMOIN : sans mémoire de session, cet état RAMÈNE l’écran de démarrage — le défaut d’Avi', () => {
    expect(shouldShowStartupOverlay({ ...auRetourDOnglet, hasServedBefore: false })).toBe(true);
  });

  it('mais une application qui a DÉJÀ rendu ne rejoue pas sa séquence d’installation', () => {
    expect(shouldShowStartupOverlay({ ...auRetourDOnglet, hasServedBefore: true })).toBe(false);
  });

  it('un VRAI redémarrage garde son écran, même après un premier rendu', () => {
    expect(
      shouldShowStartupOverlay({ ...auRetourDOnglet, hasServedBefore: true, isStartingPreview: true }),
      'appuyer sur Exécuter doit montrer la séquence',
    ).toBe(true);
  });

  it('et un espace de travail qui n’est plus prêt aussi — on ne masque pas une vraie reconstruction', () => {
    expect(shouldShowStartupOverlay({ ...auRetourDOnglet, hasServedBefore: true, workspaceReady: false })).toBe(true);
  });

  it('une erreur reste prioritaire sur la mémoire de session', () => {
    expect(shouldShowStartupOverlay({ ...auRetourDOnglet, hasServedBefore: true, previewRunFailed: true })).toBe(false);
    expect(shouldShowStartupOverlay({ ...auRetourDOnglet, hasServedBefore: true, hasWorkspaceError: true })).toBe(
      false,
    );
  });
});
