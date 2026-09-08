import { describe, expect, it } from 'vitest';

import {
  domainesConnectes,
  etapeCourante,
  etapesDePublication,
  etatDePastille,
  invitePourReparerLaPublication,
  lignesDeJournal,
  publicationEnCours,
  resumeDesEchecs,
  revisionCourte,
} from './publication';

/*
 * RP-PUBLISH-01…06 — la publication à la Replit sur NOS données.
 *
 * Ce que ces tests tiennent avant tout, c'est l'HONNÊTETÉ de l'affichage :
 * aucune étape n'est déclarée faite sans preuve, aucun domaine n'est inventé,
 * et un déploiement annulé n'est pas compté comme une panne. Le projet a déjà
 * payé deux fois le défaut inverse — une interface qui affirme un état qu'elle
 * n'a pas vérifié.
 */

describe('étapes de publication', () => {
  it('suit le statut réel : file → compilation → publication', () => {
    expect(etapesDePublication({ status: 'QUEUED' }).map((e) => e.etat)).toEqual(['encours', 'attente', 'attente']);
    expect(etapesDePublication({ status: 'BUILDING' }).map((e) => e.etat)).toEqual(['fait', 'encours', 'attente']);
    expect(etapesDePublication({ status: 'READY' }).map((e) => e.etat)).toEqual(['fait', 'fait', 'fait']);
    expect(etapesDePublication({ status: 'CANCELED' }).map((e) => e.etat)).toEqual(['annule', 'annule', 'annule']);
  });

  it('sans déploiement, RIEN n’est présenté comme fait', () => {
    expect(etapesDePublication(undefined).map((e) => e.etat)).toEqual(['attente', 'attente', 'attente']);
    expect(etapesDePublication({}).map((e) => e.etat)).toEqual(['attente', 'attente', 'attente']);
  });

  it('place l’échec là où il est OBSERVABLE, jamais à la devinette', () => {
    // Aucun journal : la compilation n'avait pas commencé — l'échec est en amont.
    expect(etapesDePublication({ status: 'FAILED' }).map((e) => e.etat)).toEqual(['echec', 'attente', 'attente']);

    // Des journaux existent : la compilation avait commencé, c'est donc là.
    expect(
      etapesDePublication({ status: 'FAILED', logs: ['npm run build', 'error TS2304'] }).map((e) => e.etat),
    ).toEqual(['fait', 'echec', 'attente']);
  });

  it('nomme l’étape que la barre doit afficher', () => {
    expect(etapeCourante(etapesDePublication({ status: 'BUILDING' }))?.id).toBe('compilation');
    expect(etapeCourante(etapesDePublication({ status: 'FAILED' }))?.id).toBe('file');
    expect(etapeCourante(etapesDePublication({ status: 'READY' }))?.id).toBe('publication');
  });

  it('sait si une publication est en vol', () => {
    expect(publicationEnCours({ status: 'QUEUED' })).toBe(true);
    expect(publicationEnCours({ status: 'BUILDING' })).toBe(true);
    expect(publicationEnCours({ status: 'READY' })).toBe(false);
    expect(publicationEnCours(undefined)).toBe(false);
  });
});

describe('pastille d’état', () => {
  it('ne dit « Live » que sur un déploiement RÉELLEMENT prêt', () => {
    expect(etatDePastille({ status: 'READY' })).toBe('live');
    expect(etatDePastille({ status: 'BUILDING' })).toBe('encours');
    expect(etatDePastille({ status: 'FAILED' })).toBe('echec');
    expect(etatDePastille({ status: 'CANCELED' })).toBe('aucun');
    expect(etatDePastille(undefined)).toBe('aucun');
  });
});

describe('résumé des échecs', () => {
  const echecs = [
    { status: 'FAILED', completedAt: '2026-09-08T18:00:00Z' },
    { status: 'FAILED', completedAt: '2026-09-08T19:30:00Z' },
    { status: 'READY', completedAt: '2026-09-08T20:00:00Z' },
    { status: 'CANCELED', completedAt: '2026-09-08T21:00:00Z' },
  ];

  it('compte les échecs, et rien d’autre', () => {
    const resume = resumeDesEchecs(echecs);

    expect(resume?.nombre).toBe(2);
    expect(resume?.dernierA).toBe('2026-09-08T19:30:00.000Z');
  });

  it('une annulation n’est pas une panne à réparer', () => {
    expect(resumeDesEchecs([{ status: 'CANCELED' }])).toBeNull();
    expect(resumeDesEchecs([])).toBeNull();
    expect(resumeDesEchecs(undefined)).toBeNull();
  });

  it('sans date exploitable, on ne prétend pas en avoir une', () => {
    expect(resumeDesEchecs([{ status: 'FAILED' }])?.dernierA).toBeUndefined();
  });
});

describe('journaux', () => {
  it('accepte les deux formes rendues par l’API', () => {
    expect(lignesDeJournal({ logs: 'une\ndeux\n\n' })).toEqual(['une', 'deux']);
    expect(lignesDeJournal({ logs: ['une', 'deux'] })).toEqual(['une', 'deux']);
    expect(
      lignesDeJournal({ logs: [{ at: '2026-09-08T18:01:31Z', level: 'info', message: 'Deployment: a8b8c817' }] }),
    ).toEqual(['2026-09-08T18:01:31Z info: Deployment: a8b8c817']);
    expect(lignesDeJournal({})).toEqual([]);
    expect(lignesDeJournal(undefined)).toEqual([]);
  });
});

describe('domaines et révision', () => {
  it('ne retient que des URL réelles, sans doublon', () => {
    expect(
      domainesConnectes([
        { url: 'https://a.exemple' },
        { url: 'https://a.exemple' },
        { url: 'pas-une-url' },
        { url: null },
        {},
      ]),
    ).toEqual(['https://a.exemple']);
  });

  it('raccourcit la révision comme Replit, ou ne rend rien', () => {
    expect(revisionCourte({ commitSha: '022759a7bcdef0123456' })).toBe('022759a7b');
    expect(revisionCourte({ commitSha: '  ' })).toBeNull();
    expect(revisionCourte({})).toBeNull();
  });
});

describe('« Réparer avec l’agent »', () => {
  it('porte le constat, le contexte et un extrait de journal', () => {
    const invite = invitePourReparerLaPublication({
      nombreDEchecs: 7,
      provider: 'google-cloud-run',
      environment: 'production',
      journal: ['ligne 1', 'error TS2304'],
    });

    expect(invite).toContain('7 publications ont échoué.');
    expect(invite).toContain('google-cloud-run');
    expect(invite).toContain('production');
    expect(invite).toContain('error TS2304');
    expect(invite).toContain('cause première');
  });

  it('reste correct au singulier et sans journal', () => {
    const invite = invitePourReparerLaPublication({ nombreDEchecs: 1 });

    expect(invite).toContain('La publication a échoué.');
    expect(invite).not.toContain('Journaux :');
  });

  it('ne coupe que les 20 dernières lignes, les plus proches de la cause', () => {
    const journal = Array.from({ length: 50 }, (_, i) => `ligne ${i}`);
    const invite = invitePourReparerLaPublication({ nombreDEchecs: 1, journal });

    expect(invite).toContain('ligne 49');
    expect(invite).not.toContain('ligne 29');
  });
});
