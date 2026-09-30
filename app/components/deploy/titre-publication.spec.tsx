/**
 * @vitest-environment jsdom
 */

/*
 * BUG-QA0928-COSMETIQUES, point 1 — le panneau titrait « Republier votre
 * application » au-dessus de « Non publiée — rien n'a encore été publié ».
 * Mesuré le 28/09 sur un projet neuf (`artefacts/panneau-1440-Deployments.png`).
 *
 * Le titre suit la même règle que le bouton principal (`intentionDeRepublication`) :
 * « Re- » seulement s'il existe un déploiement à rejouer. Monté pour de vrai :
 * c'est le texte rendu qui se lit à l'écran, pas la clé du catalogue.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PublicationReplit } from './PublicationReplit';

const UN_DEPLOIEMENT = [
  {
    id: 'dep-1',
    provider: 'static',
    environment: 'production',
    status: 'READY' as const,
    createdAt: '2026-09-09T08:00:00.000Z',
    completedAt: '2026-09-09T08:02:00.000Z',
    logs: [],
  },
];

function titre() {
  return screen.getByRole('heading', { level: 2 }).textContent;
}

describe('titre du panneau Publication', () => {
  afterEach(() => cleanup());

  it.each([
    ['en', 'Publish your app'],
    ['fr', 'Publier votre application'],
  ] as const)('projet jamais publié (%s) : « %s », pas « Re- »', (language, attendu) => {
    render(<PublicationReplit deployments={[]} language={language} ilYA={() => ''} />);

    expect(titre()).toBe(attendu);
  });

  it.each([
    ['en', 'Republish your app'],
    ['fr', 'Republier votre application'],
  ] as const)('projet déjà publié (%s) : « %s »', (language, attendu) => {
    render(<PublicationReplit deployments={UN_DEPLOIEMENT} language={language} ilYA={() => ''} />);

    expect(titre()).toBe(attendu);
  });

  it('le titre et le bouton principal ne se contredisent jamais', () => {
    for (const deployments of [[], UN_DEPLOIEMENT]) {
      render(<PublicationReplit deployments={deployments} language="fr" ilYA={() => ''} />);

      const bouton = screen.getByRole('button', { name: /^(Re)?publier$/i }).textContent?.trim() ?? '';
      expect(titre()?.startsWith('Republier')).toBe(bouton.startsWith('Republier'));
      cleanup();
    }
  });
});
