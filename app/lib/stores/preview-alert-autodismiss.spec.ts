import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPreviewHealthy, shouldAutoDismissPreviewAlert } from './preview-alert-autodismiss';
import type { PreviewInfo } from './previews';
import type { ActionAlert } from '~/types/actions';

/*
 * BUG-UX-PREVIEW-ERROR-STICKY — la carte « Erreur d'aperçu » restait affichée
 * après que l'aperçu s'était réparé, jusqu'au clic « Fermer ». La règle testée
 * ici : elle se retire toute seule sur le front malade → sain, et UNIQUEMENT
 * sur ce front.
 */

const previewAlert: ActionAlert = {
  type: 'error',
  title: 'Preview error',
  description: 'boom',
  content: 'boom',
  source: 'preview',
};

const terminalAlert: ActionAlert = { ...previewAlert, title: 'Terminal error', source: 'terminal' };

const preview = (over: Partial<PreviewInfo>): PreviewInfo => ({
  port: 5173,
  ready: false,
  baseUrl: 'https://p.example',
  ...over,
});

describe('isPreviewHealthy', () => {
  it('sain dès qu_un port forwardé répond (ready)', () => {
    expect(isPreviewHealthy([preview({ ready: true })])).toBe(true);
    expect(isPreviewHealthy([preview({ ready: false }), preview({ port: 3000, ready: true })])).toBe(true);
  });

  it('malade sans port prêt — y compris sans aucun preview', () => {
    expect(isPreviewHealthy([])).toBe(false);
    expect(isPreviewHealthy([preview({ ready: false })])).toBe(false);
  });
});

describe('shouldAutoDismissPreviewAlert', () => {
  it('AVANT : la carte ne partait que sur clic — APRÈS : le front malade → sain la retire', () => {
    expect(shouldAutoDismissPreviewAlert({ wasHealthy: false, isHealthy: true, alert: previewAlert })).toBe(true);
  });

  it('pas de front, pas de balayage : une alerte posée pendant un aperçu déjà sain reste visible', () => {
    // Fichier verrouillé / diff refusé partagent `source: 'preview'` : ne pas les cacher.
    expect(shouldAutoDismissPreviewAlert({ wasHealthy: true, isHealthy: true, alert: previewAlert })).toBe(false);
  });

  it('un aperçu toujours malade ne retire rien', () => {
    expect(shouldAutoDismissPreviewAlert({ wasHealthy: false, isHealthy: false, alert: previewAlert })).toBe(false);
    expect(shouldAutoDismissPreviewAlert({ wasHealthy: true, isHealthy: false, alert: previewAlert })).toBe(false);
  });

  it('ne touche jamais une alerte non-aperçu ni l_absence d_alerte', () => {
    expect(shouldAutoDismissPreviewAlert({ wasHealthy: false, isHealthy: true, alert: terminalAlert })).toBe(false);
    expect(shouldAutoDismissPreviewAlert({ wasHealthy: false, isHealthy: true, alert: undefined })).toBe(false);
  });
});

describe('câblage réel dans le store workbench', () => {
  const workbench = readFileSync(join(__dirname, 'workbench.ts'), 'utf8');

  it('le store s_abonne aux previews et efface l_alerte sur le front sain', () => {
    expect(workbench).toMatch(/shouldAutoDismissPreviewAlert\(\{/);
    expect(workbench).toMatch(/this\.previews\.subscribe\(/);
    expect(workbench).toMatch(
      /shouldAutoDismissPreviewAlert\(\{[\s\S]{0,200}\}\)\s*\)\s*\{\s*this\.actionAlert\.set\(undefined\);/,
    );
  });
});
