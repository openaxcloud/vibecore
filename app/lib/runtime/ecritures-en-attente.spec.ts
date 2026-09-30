import { beforeEach, describe, expect, it } from 'vitest';
import {
  definirProjetCourant,
  ecrituresEnAttenteStore,
  estRefusFauteDeWorkspace,
  rejouerDansLeWorkspace,
  rejouerEcritures,
  retenirEcriture,
  TAILLE_MAX_CONSERVEE,
  type Rangement,
} from './ecritures-en-attente';

/*
 * BUG-QA0928-RUNTIME-ID-PROJET — 78 écritures refusées en production le
 * 2026-09-28, perdues sans un mot. Ce qui est tenu ici : une écriture refusée
 * faute de workspace est GARDÉE, SURVIT au rechargement de « Redémarrer
 * l'espace de travail », et est ÉCRITE au démarrage suivant.
 */

function rangementEnMemoire(): Rangement & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>();

  return {
    donnees,
    lire: (cle) => donnees.get(cle) ?? null,
    ecrire: (cle, valeur) => void donnees.set(cle, valeur),
    effacer: (cle) => void donnees.delete(cle),
  };
}

describe('écritures en attente', () => {
  let rangement: ReturnType<typeof rangementEnMemoire>;

  beforeEach(() => {
    rangement = rangementEnMemoire();
    definirProjetCourant('proj-a', rangement);
  });

  it('ne retient que les refus faute de workspace', () => {
    expect(estRefusFauteDeWorkspace({ code: 'WORKSPACE_NOT_STARTED' })).toBe(true);
    expect(estRefusFauteDeWorkspace({ code: 'REMOTE_RUNTIME_REQUEST_FAILED' })).toBe(false);
    expect(estRefusFauteDeWorkspace(new Error('JSON invalide'))).toBe(false);
  });

  it('garde la DERNIÈRE version de chaque chemin', () => {
    retenirEcriture('src/App.tsx', 'v1', rangement, 1);
    retenirEcriture('src/main.tsx', 'm', rangement, 2);
    retenirEcriture('src/App.tsx', 'v2', rangement, 3);

    const etat = ecrituresEnAttenteStore.get();
    expect(etat.ecritures.map((e) => [e.chemin, e.contenu])).toEqual([
      ['src/main.tsx', 'm'],
      ['src/App.tsx', 'v2'],
    ]);
    expect(etat.conservees).toBe(true);
  });

  it('survit au rechargement : un nouvel état relu depuis le rangement retrouve la file', () => {
    retenirEcriture('src/App.tsx', 'contenu', rangement, 1);

    // « Redémarrer l'espace de travail » recharge la page : le magasin repart de zéro.
    ecrituresEnAttenteStore.set({ ecritures: [], conservees: true });
    definirProjetCourant('proj-a', rangement);

    expect(ecrituresEnAttenteStore.get().ecritures.map((e) => e.chemin)).toEqual(['src/App.tsx']);
  });

  it('rejoue dans l’ordre, retire ce qui a été écrit, garde ce qui a échoué', async () => {
    retenirEcriture('a.txt', 'A', rangement, 1);
    retenirEcriture('b.txt', 'B', rangement, 2);
    retenirEcriture('c.txt', 'C', rangement, 3);

    const ordre: string[] = [];

    const bilan = await rejouerEcritures(
      'proj-a',
      async (chemin) => {
        ordre.push(chemin);

        if (chemin === 'b.txt') {
          throw Object.assign(new Error('pas encore'), { code: 'WORKSPACE_NOT_STARTED' });
        }
      },
      rangement,
    );

    expect(ordre).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(bilan).toEqual({ ecrites: ['a.txt', 'c.txt'], restantes: ['b.txt'] });

    definirProjetCourant('proj-a', rangement);
    expect(ecrituresEnAttenteStore.get().ecritures.map((e) => e.chemin)).toEqual(['b.txt']);
  });

  it('une file vide ne laisse rien dans le rangement', async () => {
    retenirEcriture('a.txt', 'A', rangement, 1);
    await rejouerEcritures('proj-a', async () => undefined, rangement);

    expect([...rangement.donnees.keys()]).toEqual([]);
  });

  it('isole les projets', () => {
    retenirEcriture('a.txt', 'A', rangement, 1);
    definirProjetCourant('proj-b', rangement);

    expect(ecrituresEnAttenteStore.get().ecritures).toEqual([]);
  });

  it('avoue quand le navigateur refuse d’en garder une copie', () => {
    const plein: Rangement = {
      ...rangement,
      ecrire: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };

    retenirEcriture('a.txt', 'A', plein, 1);

    expect(ecrituresEnAttenteStore.get().conservees).toBe(false);
    expect(ecrituresEnAttenteStore.get().ecritures).toHaveLength(1);
  });

  it('ne promet pas la durabilité au-delà du plafond', () => {
    retenirEcriture('gros.txt', 'x'.repeat(TAILLE_MAX_CONSERVEE + 1), rangement, 1);

    expect(ecrituresEnAttenteStore.get().conservees).toBe(false);
    expect([...rangement.donnees.keys()]).toEqual([]);
  });

  it('sans projet courant, ne retient rien (mode WebContainer)', () => {
    definirProjetCourant(undefined, rangement);
    retenirEcriture('a.txt', 'A', rangement, 1);

    expect(ecrituresEnAttenteStore.get().ecritures).toEqual([]);
  });

  it('le rejeu du workspace crée le dossier AVANT d’écrire, et seulement s’il y en a un', async () => {
    retenirEcriture('src/components/Carte.tsx', 'c', rangement, 1);
    retenirEcriture('README.md', 'r', rangement, 2);

    const journal: string[] = [];

    await rejouerDansLeWorkspace(
      'proj-a',
      {
        createDirectory: async (chemin) => void journal.push(`mkdir ${chemin}`),
        writeFile: async (chemin) => void journal.push(`write ${chemin}`),
      },
      rangement,
    );

    expect(journal).toEqual(['mkdir src/components', 'write src/components/Carte.tsx', 'write README.md']);
  });
});
