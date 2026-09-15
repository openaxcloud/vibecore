import { describe, expect, it } from 'vitest';

import { cleDeRejet, enregistrerLeRejet, noteEstPertinente, rejetEnregistre } from './note-dev-prod';

describe('note « où sont passées mes données ? »', () => {
  it('ne s’affiche pas quand le projet n’a qu’UNE base — la confusion est impossible', () => {
    expect(noteEstPertinente({ environnements: [{ key: 'DATABASE_URL' }], rejetee: false })).toBe(false);
  });

  it('s’affiche dès que deux bases DISTINCTES coexistent', () => {
    expect(
      noteEstPertinente({
        environnements: [{ key: 'DATABASE_URL' }, { key: 'PROD_DATABASE_URL' }],
        rejetee: false,
      }),
    ).toBe(true);
  });

  it('ne compte pas deux fois la même base', () => {
    expect(
      noteEstPertinente({
        environnements: [{ key: 'DATABASE_URL' }, { key: 'DATABASE_URL' }],
        rejetee: false,
      }),
    ).toBe(false);
  });

  it('reste écartée une fois congédiée', () => {
    expect(
      noteEstPertinente({
        environnements: [{ key: 'DATABASE_URL' }, { key: 'PROD_DATABASE_URL' }],
        rejetee: true,
      }),
    ).toBe(false);
  });

  it('le rejet est rangé PAR PROJET, et relu', () => {
    const donnees = new Map<string, string>();

    const magasin = {
      getItem: (k: string) => donnees.get(k) ?? null,
      setItem: (k: string, v: string) => void donnees.set(k, v),
    };

    enregistrerLeRejet('projet-1', magasin);

    expect(rejetEnregistre('projet-1', magasin)).toBe(true);
    expect(rejetEnregistre('projet-2', magasin), 'un projet n’en congédie pas un autre').toBe(false);
    expect(donnees.has(cleDeRejet('projet-1'))).toBe(true);
  });

  it('un magasin indisponible ne casse rien', () => {
    const refus = {
      getItem: () => {
        throw new Error('navigation privée');
      },
      setItem: () => {
        throw new Error('navigation privée');
      },
    };

    expect(rejetEnregistre('projet-1', refus)).toBe(false);
    expect(() => enregistrerLeRejet('projet-1', refus)).not.toThrow();
  });
});
