/**
 * @vitest-environment jsdom
 */

/*
 * Décision d'Avi du 2026-10-01 : publier peut mettre en veille l'autre projet
 * d'un client gratuit — et le panneau de publication DOIT le dire, là où le
 * client regarde. Sinon il retrouve son autre projet arrêté sans savoir pourquoi,
 * et c'est exactement la confusion « arrêter » / « perdre » que le produit a déjà
 * connue deux fois.
 *
 * Le texte vient du journal du déploiement (ligne `warn`), traduit par l'API à la
 * lecture ; on monte le vrai panneau et on lit ce qui s'affiche.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PublicationReplit } from './PublicationReplit';
import { avisDuDeploiement } from './publication';

const AVIS =
  'Nous avons mis en veille votre projet « Projet A » pour publier celui-ci : votre forfait permet un seul espace de travail actif à la fois. Ses fichiers sont conservés ; il se rouvre dès que vous y retournez.';

const deploiement = (logs: Array<{ level: string; message: string }>) => [
  {
    id: 'dep-1',
    provider: 'static',
    environment: 'production',
    status: 'READY' as const,
    createdAt: '2026-10-01T06:00:00.000Z',
    startedAt: '2026-10-01T06:00:00.000Z',
    completedAt: '2026-10-01T06:02:00.000Z',
    logs: logs.map((ligne) => ({ timestamp: '2026-10-01T06:00:00.000Z', ...ligne })),
  },
];

describe('le panneau de publication dit qu’un autre projet a été mis en veille', () => {
  afterEach(() => cleanup());

  it('publication réussie après mise en veille : l’avis est affiché, sans ouvrir les journaux', () => {
    render(
      <PublicationReplit
        deployments={deploiement([
          { level: 'info', message: 'Queued static deployment for Projet B' },
          { level: 'warn', message: AVIS },
          { level: 'info', message: 'Build succeeded' },
        ])}
        language="fr"
        ilYA={() => 'il y a 1 min'}
      />,
    );

    expect(screen.getByTestId('publication-avis').textContent).toBe(AVIS);
  });

  it('TÉMOIN — sans avis dans le journal, le panneau n’en invente pas', () => {
    render(
      <PublicationReplit
        deployments={deploiement([{ level: 'info', message: 'Build succeeded' }])}
        language="fr"
        ilYA={() => ''}
      />,
    );

    expect(screen.queryByTestId('publication-avis')).toBeNull();
  });

  it('c’est le DERNIER avis qui compte : « mis en veille » remplace « nous attendons »', () => {
    expect(
      avisDuDeploiement(
        deploiement([
          { level: 'warn', message: 'Votre projet « Projet A » a une génération en cours…' },
          { level: 'warn', message: AVIS },
        ])[0],
      ),
    ).toBe(AVIS);
  });
});
