import { describe, expect, it } from 'vitest';
import {
  compterLesActions,
  compterLesLignesLues,
  formaterLaDateDuPoint,
  formaterLaDuree,
  formaterLeCout,
  ilYA,
  leBlocAQuelqueChoseAMontrer,
  leTourAEcritDesFichiers,
  lignesDuDetailDuTour,
  messageDeCommitDuTour,
  pointDeRestaurationDuMessage,
  pointsDeRestaurationParMessage,
  statistiquesDuTour,
  titreDeLaLignePoint,
  titreDeLaLigneTravail,
} from './fin-de-tour';

/*
 * RP-CKPT-02 / 03 — ce que Replit affiche sous une réponse de l'agent
 * (captures d'Avi du 08/09, 07:49) : « Worked for 2 minutes » puis, déplié,
 * Time worked 2 minutes / Work done 15 actions / Items read 218 lines /
 * Agent usage $3.21 ; « Checkpoint made 25 days ago », déplié : le message du
 * commit, « Aug 13, 2026 at 9:22 PM », Rollback here, Changes.
 */

const contenuAvecArtefact =
  'La page de contact est créée.\n\n' +
  '<boltArtifact id="contact" title="Page de contact">' +
  '<boltAction type="file" filePath="src/Contact.tsx">// contact\n</boltAction>' +
  '<boltAction type="shell">pnpm install</boltAction>' +
  '</boltArtifact>';

const partieLecture = (toolName: string, result: unknown, state = 'result') => ({
  type: 'tool-invocation',
  toolInvocation: { toolName, state, result },
});

describe('statistiques du tour', () => {
  it('compte les actions d’artefact et les appels d’outil', () => {
    expect(compterLesActions({ content: contenuAvecArtefact })).toBe(2);
    expect(
      compterLesActions({
        content: contenuAvecArtefact,
        parts: [partieLecture('read_file', 'a\nb'), partieLecture('apply_patch', {})],
      }),
    ).toBe(4);
    expect(compterLesActions({ content: 'Juste du texte.' })).toBe(0);
  });

  it('compte les lignes rendues par les outils de lecture, et seulement eux', () => {
    const message = {
      content: '',
      parts: [
        partieLecture('read_file', 'ligne 1\nligne 2\nligne 3'),
        partieLecture('search_files', { content: 'a\nb' }),
        partieLecture('apply_patch', 'x\ny\nz'),
        partieLecture('read_file', 'en cours', 'call'),
      ],
    };

    expect(compterLesLignesLues(message)).toBe(5);
  });

  it('sait si le tour a écrit des fichiers', () => {
    expect(leTourAEcritDesFichiers({ content: contenuAvecArtefact })).toBe(true);
    expect(leTourAEcritDesFichiers({ content: 'Voici une explication.' })).toBe(false);
    expect(leTourAEcritDesFichiers({ content: '', parts: [partieLecture('apply_patch', {})] })).toBe(true);
    expect(leTourAEcritDesFichiers({ content: '', parts: [partieLecture('read_file', 'a')] })).toBe(false);
  });

  it('lit la durée, le coût et les jetons dans l’annotation usage', () => {
    const statistiques = statistiquesDuTour({
      content: contenuAvecArtefact,
      annotations: [{ type: 'usage', value: { totalTokens: 12_400, durationMs: 120_000, costCents: 321 } }],
    });

    expect(statistiques).toEqual({ dureeMs: 120_000, actions: 2, lignesLues: 0, coutCents: 321, jetons: 12_400 });
    expect(statistiquesDuTour({ content: 'x' })).toEqual({
      dureeMs: undefined,
      actions: 0,
      lignesLues: 0,
      coutCents: undefined,
      jetons: undefined,
    });
  });

  it('rend les quatre lignes de Replit, dans l’ordre', () => {
    const lignes = lignesDuDetailDuTour({ dureeMs: 120_000, actions: 15, lignesLues: 218, coutCents: 321 }, 'en');

    expect(lignes.map((ligne) => [ligne.libelle, ligne.valeur])).toEqual([
      ['Time worked', '2 minutes'],
      ['Work done', '15 actions'],
      ['Items read', '218 lines'],
      ['Agent usage', '$3.21'],
    ]);

    const fr = lignesDuDetailDuTour({ actions: 1, lignesLues: 1, jetons: 12_400 }, 'fr');

    expect(fr.map((ligne) => ligne.valeur)).toEqual(['—', '1 action', '1 ligne', `12${'\u202f'}400 jetons`]);
  });

  it('titre la ligne « Worked for »', () => {
    expect(titreDeLaLigneTravail({ dureeMs: 120_000, actions: 0, lignesLues: 0 }, 'en')).toBe('Worked for 2 minutes');
    expect(titreDeLaLigneTravail({ dureeMs: 120_000, actions: 0, lignesLues: 0 }, 'fr')).toBe('A travaillé 2 minutes');
    expect(titreDeLaLigneTravail({ actions: 3, lignesLues: 0 }, 'en')).toBe('Worked on this turn');
  });
});

describe('message de commit du tour', () => {
  it('prend les titres d’artefact quand il y en a', () => {
    expect(messageDeCommitDuTour(contenuAvecArtefact, 'repli')).toBe('Page de contact');
    expect(
      messageDeCommitDuTour(
        '<boltArtifact id="a" title="Panier"></boltArtifact><boltArtifact id="b" title="Paiement"></boltArtifact>',
        'repli',
      ),
    ).toBe('Panier, Paiement');
  });

  it('sinon la première ligne de prose, sans Markdown, tronquée à 72', () => {
    expect(messageDeCommitDuTour('## **Mise à jour** des `données`\n\nsuite', 'repli')).toBe('Mise à jour des données');
    expect(messageDeCommitDuTour('x'.repeat(100), 'repli')).toHaveLength(72);
    expect(messageDeCommitDuTour('x'.repeat(100), 'repli').endsWith('…')).toBe(true);
    expect(messageDeCommitDuTour('', 'repli')).toBe('repli');
    expect(messageDeCommitDuTour('<div>  </div>', 'repli')).toBe('repli');
  });
});

describe('points de restauration', () => {
  const instantanes = [
    {
      id: 's1',
      kind: 'automatic',
      createdAt: '2026-08-13T19:22:00Z',
      manifest: { checkpoint: { messageId: 'a1', commitSha: 'abc', commitMessage: 'Un' } },
    },
    {
      id: 's2',
      kind: 'automatic',
      createdAt: '2026-08-13T19:30:00Z',
      manifest: {
        checkpoint: {
          messageId: 'a1',
          commitSha: 'def',
          commitMessage: 'Deux',
          statistiques: { actions: 15, lignesLues: 218, dureeMs: 120_000, coutCents: 321 },
        },
      },
    },
    { id: 's3', kind: 'manual', createdAt: '2026-08-14T00:00:00Z', manifest: {} },
    { id: 's4', kind: 'automatic', createdAt: '2026-08-14T00:00:00Z', manifest: { checkpoint: { messageId: '' } } },
  ];

  it('associe le point le plus récent à son message, ignore le reste', () => {
    const points = pointsDeRestaurationParMessage(instantanes);

    expect([...points.keys()]).toEqual(['a1']);
    expect(points.get('a1')).toMatchObject({ snapshotId: 's2', commitSha: 'def', commitMessage: 'Deux' });
    expect(points.get('a1')?.statistiques).toEqual({
      actions: 15,
      lignesLues: 218,
      dureeMs: 120_000,
      coutCents: 321,
      jetons: undefined,
    });
    expect(pointDeRestaurationDuMessage(instantanes, 'zzz')).toBeNull();
  });

  it('retrouve le point par la conversation et le rang du tour quand l’identifiant du message a changé au relu', () => {
    const relus = [
      {
        id: 's9',
        kind: 'automatic',
        createdAt: '2026-08-13T19:22:00Z',
        manifest: {
          checkpoint: { messageId: 'client-2', conversationId: 'conv', turnIndex: 1, commitMessage: 'Deuxième tour' },
        },
      },
    ];
    const messages = [
      { id: 'aimsg_u1', role: 'user' },
      { id: 'aimsg_a1', role: 'assistant' },
      { id: 'aimsg_u2', role: 'user' },
      { id: 'aimsg_a2', role: 'assistant' },
    ];

    const points = pointsDeRestaurationParMessage(relus, { messages, conversationId: 'conv' });

    expect(points.get('aimsg_a2')?.commitMessage).toBe('Deuxième tour');
    expect(points.get('aimsg_a1')).toBeUndefined();
    expect(
      pointsDeRestaurationParMessage(relus, { messages, conversationId: 'autre' }).get('aimsg_a2'),
    ).toBeUndefined();
    expect(pointsDeRestaurationParMessage(relus).get('client-2')?.turnIndex).toBe(1);
  });

  it('titre la ligne « Checkpoint made … ago »', () => {
    const maintenant = Date.parse('2026-09-07T19:22:00Z');

    expect(titreDeLaLignePoint({ createdAt: '2026-08-13T19:22:00Z' }, 'en', maintenant)).toBe(
      'Checkpoint made 25 days ago',
    );
    expect(titreDeLaLignePoint({ createdAt: '2026-08-13T19:22:00Z' }, 'fr', maintenant)).toBe(
      'Point de restauration créé il y a 25 jours',
    );
  });

  it('montre le bloc dès qu’il y a quelque chose de vrai à montrer', () => {
    expect(leBlocAQuelqueChoseAMontrer({ actions: 0, lignesLues: 0 }, null)).toBe(false);
    expect(leBlocAQuelqueChoseAMontrer({ actions: 2, lignesLues: 0 }, null)).toBe(true);
    expect(
      leBlocAQuelqueChoseAMontrer({ actions: 0, lignesLues: 0 }, pointDeRestaurationDuMessage(instantanes, 'a1')),
    ).toBe(true);
  });
});

describe('formats', () => {
  it('durée', () => {
    expect(formaterLaDuree(300, 'en')).toBe('less than a second');
    expect(formaterLaDuree(1_000, 'en')).toBe('1 second');
    expect(formaterLaDuree(38_000, 'en')).toBe('38 seconds');
    expect(formaterLaDuree(120_000, 'en')).toBe('2 minutes');
    expect(formaterLaDuree(3_900_000, 'en')).toBe('1 hour 5 minutes');
    expect(formaterLaDuree(7_200_000, 'fr')).toBe('2 heures');
  });

  it('il y a', () => {
    const maintenant = Date.parse('2026-09-08T08:00:00Z');

    expect(ilYA('2026-09-08T07:59:50Z', 'en', maintenant)).toBe('just now');
    expect(ilYA('2026-09-08T07:59:00Z', 'en', maintenant)).toBe('1 minute ago');
    expect(ilYA('2026-09-08T05:00:00Z', 'en', maintenant)).toBe('3 hours ago');
    expect(ilYA('2026-07-08T08:00:00Z', 'en', maintenant)).toBe('2 months ago');
    expect(ilYA('2024-09-08T08:00:00Z', 'fr', maintenant)).toBe('il y a 2 ans');
    expect(ilYA(undefined, 'en', maintenant)).toBe('just now');
  });

  it('coût et date', () => {
    expect(formaterLeCout(321, 'en')).toBe('$3.21');
    expect(formaterLeCout(321, 'fr')).toBe('3,21 $');

    const enUTC = formaterLaDateDuPoint('2026-08-13T21:22:00', 'en');

    expect(enUTC).toMatch(/^Aug 13, 2026 at 9:22 PM$/u);
    expect(formaterLaDateDuPoint('2026-08-13T21:22:00', 'fr')).toMatch(/^13 août 2026 à 21:22$/u);
    expect(formaterLaDateDuPoint(undefined, 'en')).toBe('—');
  });
});
