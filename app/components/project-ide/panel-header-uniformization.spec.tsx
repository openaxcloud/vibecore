/**
 * @vitest-environment jsdom
 */

/*
 * UNIF-06 (lot 4 de docs/UX_UNIFORMIZATION_AUDIT.md) — en-tête de panneau
 * unique :
 *
 * H1  le même IdePanelHeader (icône + titre + slot méta/actions, 36 px) sert la
 *     coque service ET les panneaux workspace qui divergeaient (Problems) ou
 *     n'avaient aucune tête (Search, Locks) ; le double standard 34/36 px de
 *     ui/PanelHeader est fusionné sur 36 px ;
 * H2 (révisé — AV-UX point 10, 2026-08-25) : Avi a ensuite demandé le retrait
 *     COMPLET de la rangée « Mis à jour … / Actualiser » : le rafraîchissement
 *     est automatique (intervalle silencieux) et la puce n'apportait qu'une
 *     méta-information. La coque service garde l'en-tête icône+titre nu, et le
 *     mobile masque cette rangée (le titre est déjà dans l'en-tête gelé).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { IdePanelHeader } from './PanelPrimitives';
import { lockManagerEn, lockManagerFr } from '~/lib/i18n/catalogs/lock-manager';
import { workbenchSearchEn, workbenchSearchFr } from '~/lib/i18n/catalogs/workbench-search';

const read = (...segments: string[]) => readFileSync(join(__dirname, ...segments), 'utf8');

const baseChatSource = read('..', 'chat', 'BaseChat.tsx');
const searchSource = read('..', 'workbench', 'Search.tsx');
const lockManagerSource = read('..', 'workbench', 'LockManager.tsx');
const uiPanelHeaderSource = read('..', 'ui', 'PanelHeader.tsx');
const indexScssSource = read('..', '..', 'styles', 'index.scss');

afterEach(() => cleanup());

describe('UNIF-06 — IdePanelHeader partagé (H1)', () => {
  it('rend icône + titre h2 + slot actions dans la tête commune (DOM)', () => {
    const { container } = render(
      <IdePanelHeader icon="i-ph:magnifying-glass" title="Search" titleTabIndex={-1}>
        <button type="button">action</button>
      </IdePanelHeader>,
    );

    const header = container.querySelector('.bolt-project-ide-panel-header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.querySelector('span.i-ph\\:magnifying-glass')).not.toBeNull();

    const title = header.querySelector('h2') as HTMLElement;
    expect(title.textContent).toBe('Search');
    expect(title.tabIndex).toBe(-1);

    expect(screen.getByRole('button', { name: 'action' }).parentElement?.className).toContain('ml-auto');
  });

  it('la coque service des panneaux gestion consomme IdePanelHeader (source)', () => {
    expect(baseChatSource).toContain('<IdePanelHeader icon={icon} title={title} />');
  });

  it('Problems abandonne sa tête maison pour IdePanelHeader (source + SCSS)', () => {
    expect(baseChatSource).not.toContain('bolt-project-problems-header');
    expect(indexScssSource).not.toMatch(/^\.bolt-project-problems-header \{/m);
    expect(baseChatSource).toContain("IdePanelHeader icon={panelIcon('problems')}");
  });

  it('Search et Locks, qui n’avaient AUCUNE tête, adoptent IdePanelHeader (source)', () => {
    expect(searchSource).toContain('<IdePanelHeader');
    expect(searchSource).toContain("t('workbenchSearch.panel.title')");
    expect(lockManagerSource).toContain('<IdePanelHeader');
    expect(lockManagerSource).toContain("copy['lockManager.panel.title']");
  });

  it('les titres de tête Search/Locks existent en EN et FR', () => {
    expect(workbenchSearchEn['workbenchSearch.panel.title']).toBe('Search');
    expect(workbenchSearchFr['workbenchSearch.panel.title']).toBe('Recherche');
    expect(lockManagerEn['lockManager.panel.title']).toBe('Locks');
    expect(lockManagerFr['lockManager.panel.title']).toBe('Verrous');
  });

  it('ui/PanelHeader est fusionné sur le standard 36 px', () => {
    expect(uiPanelHeaderSource).toContain('min-h-[36px]');
    expect(uiPanelHeaderSource).not.toContain('min-h-[34px]');
  });
});

describe('AV-UX point 10 — rangée « Mis à jour … / Actualiser » retirée, refresh automatique', () => {
  it('la puce « Updated » et le menu ⋮ ne sont plus rendus par la coque service', () => {
    expect(baseChatSource).not.toContain('data-testid="ide-panel-updated-at"');
    expect(baseChatSource).not.toContain('data-testid="ide-panel-actions"');
    expect(baseChatSource).not.toContain('bolt-project-panel-actions-menu');
  });

  it('le rafraîchissement automatique silencieux reste en place', () => {
    expect(baseChatSource).toContain('void loadPanel({ silent: true });');
    expect(baseChatSource).toContain('}, refreshIntervalMs);');
  });

  it('le mobile masque la rangée icône+titre du panneau service (titre déjà dans l’en-tête)', () => {
    expect(indexScssSource).toMatch(
      /\.bolt-workbench-mobile-service\s*\n?\s*\.bolt-project-service-panel\s*\n?\s*>\s*\.bolt-project-ide-panel-header\s*\{\s*\n\s*display:\s*none;/,
    );
  });
});
