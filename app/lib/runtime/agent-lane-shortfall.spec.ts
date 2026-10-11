import { describe, expect, it } from 'vitest';
import { ecartsAAvertir, ecartsDesLanes, livraisonIncomplete } from './agent-lane-shortfall';

describe('ecartsDesLanes', () => {
  it('ne signale rien quand tout ce qui est annonce a ete ecrit', () => {
    const ecarts = ecartsDesLanes(
      [{ roleId: 'frontend', status: 'complete', files: ['src/A.tsx', 'src/B.tsx'] }],
      ['src/A.tsx', 'src/B.tsx'],
    );
    expect(ecarts[0]).toMatchObject({ annonces: 2, ecrits: 2, manquants: [] });
    expect(livraisonIncomplete(ecarts)).toBe(false);
  });

  /*
   * LE CAS QUI COMMANDE CE MODULE. Un role qui se DIT complet sans avoir rien
   * ecrit doit compter comme incomplet — c'est exactement le defaut du
   * 2026-09-07 : quatre rapports « complete » pour 90 chemins, 9 fichiers.
   */
  it('compte comme incomplet un role qui se DIT complet sans avoir ecrit', () => {
    const ecarts = ecartsDesLanes([{ roleId: 'backend', status: 'complete', files: ['src/api.ts'] }], []);
    expect(ecarts[0]).toMatchObject({ annonces: 1, ecrits: 0, manquants: ['src/api.ts'] });
    expect(livraisonIncomplete(ecarts)).toBe(true);
  });

  it('nomme les fichiers manquants dans leur ordre d annonce', () => {
    const ecarts = ecartsDesLanes([{ roleId: 'qa', status: 'partial', files: ['a.ts', 'b.ts', 'c.ts'] }], ['b.ts']);
    expect(ecarts[0].manquants).toEqual(['a.ts', 'c.ts']);
  });

  /*
   * L'ACCORD SUR « LE MEME FICHIER ». Un role annonce `./src/App.tsx`, l'arbitre
   * a enregistre `src/App.tsx`. Sans reduction commune, on signalerait un
   * manquant qui est en fait sur le disque — un faux positif qui detruirait la
   * confiance dans l'avertissement lui-meme.
   */
  it('reconnait le meme fichier ecrit sous une autre graphie', () => {
    const ecarts = ecartsDesLanes(
      [{ roleId: 'architect', status: 'complete', files: ['./src/App.tsx'] }],
      ['/src//App.tsx'],
    );
    expect(ecarts[0].manquants).toEqual([]);
  });

  it('un role tombe rend la livraison incomplete meme sans fichier annonce', () => {
    expect(livraisonIncomplete(ecartsDesLanes([{ roleId: 'devops', status: 'failed' }], []))).toBe(true);
  });
});

describe('ecartsAAvertir — le site d appel', () => {
  const rapports = [{ roleId: 'frontend' as const, status: 'complete' as const, files: ['src/A.tsx'] }];

  /*
   * EN COURS DE FLUX, UN « MANQUANT » N'EN EST PAS UN. Sans cette garde, une
   * alerte rouge clignoterait pendant toute la generation, et l'utilisateur
   * apprendrait a l'ignorer — exactement ce qui rend un avertissement inutile
   * le jour ou il dit vrai.
   */
  it("ne dit rien tant que le resultat agrege n'est pas arrive", () => {
    expect(ecartsAAvertir(rapports, [], false)).toEqual([]);
  });

  it('ne dit rien quand la livraison est complete', () => {
    expect(ecartsAAvertir(rapports, ['src/A.tsx'], true)).toEqual([]);
  });

  it('avertit, et seulement pour les roles reellement en ecart', () => {
    const ecarts = ecartsAAvertir(
      [
        { roleId: 'frontend', status: 'complete', files: ['src/A.tsx'] },
        { roleId: 'backend', status: 'complete', files: ['src/B.ts'] },
      ],
      ['src/A.tsx'],
      true,
    );
    expect(ecarts.map((e) => e.roleId)).toEqual(['backend']);
  });

  it('ne dit rien sans rapport du tout', () => {
    expect(ecartsAAvertir(undefined, [], true)).toEqual([]);
  });

  /*
   * LA FAUSSE ALERTE SUR L'HISTORIQUE — le defaut que ce test epingle.
   *
   * Au rechargement de la page, l'historique se reaffiche alors que la carte
   * des arbitres est VIDE. Si `undefined` (aucune trace) se confond avec `[]`
   * (rien ecrit), chaque ancien message annonce « Livraison incomplete » pour
   * la totalite de ses fichiers — y compris ceux qui sont sur le disque.
   *
   * Un avertissement qui crie a tort sur l'historique est pire que pas
   * d'avertissement du tout : il apprend a l'utilisateur a l'ignorer.
   */
  it("ne crie pas quand il n'y a AUCUNE trace d'arbitrage (page rechargee)", () => {
    expect(ecartsAAvertir(rapports, undefined, true)).toEqual([]);
  });

  /*
   * LA MOITIE INVERSE (regle 6) : une trace VIDE est un ecart reel, et doit
   * bien declencher. Sans elle, on pourrait faire taire l'avertissement partout
   * en rendant toujours `undefined`, et les deux tests resteraient verts.
   */
  it('crie quand la trace existe et ne contient rien', () => {
    expect(ecartsAAvertir(rapports, [], true).map((e) => e.roleId)).toEqual(['frontend']);
  });
});
