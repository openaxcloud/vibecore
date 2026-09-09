import { describe, expect, it } from 'vitest';

import { analyserGeneration, generationEstHonnete, modulesReclames } from './generation-incomplete';

/*
 * Les deux cas sont RÉELS, relevés en production le 2026-09-08 :
 *
 *   cmtt810ag00040nah6wkh8z1x — 24 fichiers, artefact non clos, `src/main.tsx`
 *                               jamais déclaré ; « applied successfully ».
 *   cmtst5sp100gm0ofitn0qxi9b — 38 fichiers, artefact clos (12 / 12),
 *                               `src/main.tsx` et `src/App.tsx` déclarés.
 *
 * Le second est le TÉMOIN POSITIF : sans lui, une garde qui refuse tout
 * passerait au vert sans rien distinguer.
 */

const INDEX_REEL = `<!doctype html>
<html lang="fr">
  <head><title>Atelier Nord</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const BOUTIQUE_TRONQUEE: Record<string, string> = {
  'index.html': INDEX_REEL,
  'package.json': '{"name":"boutique-mobilier-design"}',
  'src/components/ProductGrid.tsx': 'export const ProductGrid = () => null;',
  'src/components/CartDrawer.tsx': 'export const CartDrawer = () => null;',
  'src/hooks/useCart.ts': 'export const useCart = () => null;',
};

const BOUTIQUE_COMPLETE: Record<string, string> = {
  ...BOUTIQUE_TRONQUEE,
  'src/main.tsx': 'import { createRoot } from "react-dom/client";',
  'src/App.tsx': 'export default function App() { return null; }',
};

describe('une génération qui ne peut pas démarrer ne s’annonce pas comme réussie', () => {
  it('nomme le module réclamé par index.html et absent du disque', () => {
    const constat = analyserGeneration(BOUTIQUE_TRONQUEE, { fermetureDeSecours: false });

    expect(constat.entreesManquantes).toEqual(['src/main.tsx']);
    expect(generationEstHonnete(constat), 'index.html pointe dans le vide').toBe(false);
  });

  it('TÉMOIN POSITIF — la génération saine du même jour passe', () => {
    const constat = analyserGeneration(BOUTIQUE_COMPLETE, { fermetureDeSecours: false });

    expect(constat.entreesManquantes).toEqual([]);
    expect(constat.tronquee).toBe(false);
    expect(generationEstHonnete(constat)).toBe(true);
  });

  it('un artefact fermé par le filet de fin de flux est une troncature, même si les fichiers tiennent', () => {
    const constat = analyserGeneration(BOUTIQUE_COMPLETE, { fermetureDeSecours: true });

    expect(constat.tronquee).toBe(true);
    expect(generationEstHonnete(constat), 'le flux a été coupé : on ne promet rien').toBe(false);
  });

  it('accepte le point d’entrée écrit sans extension dans index.html', () => {
    const sansExtension = { ...BOUTIQUE_COMPLETE, 'index.html': INDEX_REEL.replace('/src/main.tsx', '/src/main') };

    expect(analyserGeneration(sansExtension, { fermetureDeSecours: false }).entreesManquantes).toEqual([]);
  });

  it('ignore un script servi par une origine externe — le disque du projet ne le fournit pas', () => {
    const cdn = {
      ...BOUTIQUE_COMPLETE,
      'index.html': INDEX_REEL.replace('/src/main.tsx', 'https://cdn.example.com/x.js'),
    };

    expect(analyserGeneration(cdn, { fermetureDeSecours: false }).entreesManquantes).toEqual([]);
  });

  it('sans index.html il n’y a rien à vérifier mécaniquement', () => {
    const { 'index.html': _absent, ...sansIndex } = BOUTIQUE_TRONQUEE;

    expect(analyserGeneration(sansIndex, { fermetureDeSecours: false }).entreesManquantes).toEqual([]);
  });

  it('modulesReclames ne retient que les sources locales', () => {
    expect(modulesReclames(INDEX_REEL)).toEqual(['src/main.tsx']);
  });
});
