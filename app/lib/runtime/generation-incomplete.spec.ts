import { describe, expect, it } from 'vitest';

import {
  analyserGeneration,
  fichiersDepuisArborescence,
  generationEstHonnete,
  modulesReclames,
} from './generation-incomplete';

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
  /*
   * LE CAS QUE LES DEUX AUTRES CRITÈRES NE VOIENT PAS.
   *
   * Mesuré en production le 2026-09-09 : la clé Anthropic est à court de crédit,
   * le repli automatique bascule sur `gpt-4.1`, et ce modèle répond à une
   * consigne substantielle par un plan d'architecture terminé par « Je passe
   * maintenant à la phase d'implémentation complète » — puis s'arrête.
   * `finishReason=stop`, `segments=0`, artefact 0 ouvert / 0 fermé, ZÉRO fichier.
   * Trois fois sur trois.
   *
   * Ni la fermeture de secours ni le contrôle d'`index.html` ne peuvent voir ça :
   * il n'y a ni artefact à fermer, ni `index.html` à relire. L'utilisateur reçoit
   * un plan et une application vide, sans le moindre signal.
   *
   * Le critère qui manquait ne dépend d'aucun des deux : une génération qui se
   * termine sans avoir écrit UN SEUL fichier n'est pas une réussite.
   */
  it('AUCUN FICHIER — une génération qui n’écrit rien n’est pas une réussite', () => {
    const constat = analyserGeneration({}, { fermetureDeSecours: false });

    expect(constat.aucunFichier, 'zéro fichier écrit').toBe(true);
    expect(generationEstHonnete(constat), 'un plan sans code n’est pas une app').toBe(false);
  });

  it('TÉMOIN POSITIF — un seul fichier écrit suffit à sortir de ce cas', () => {
    const constat = analyserGeneration({ 'package.json': '{}' }, { fermetureDeSecours: false });

    expect(constat.aucunFichier).toBe(false);
  });

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

/*
 * LA MOITIÉ QUI MANQUAIT : LA GARDE DOIT ÊTRE APPELÉE.
 *
 * Mesuré avec témoin positif : `analyserGeneration` n'était importé que par ce
 * fichier de test. La règle était juste, testée, et le produit ne la consultait
 * jamais — donc il continuait d'annoncer une réussite sur une génération sans
 * point d'entrée. C'est le défaut que la règle 15 vise exactement, à l'envers :
 * pas un correctif sans garde, mais une garde sans appelant.
 */
describe('fichiersDepuisArborescence — adapter l’arborescence sans faire taire la garde', () => {
  it('ne retient que les vrais fichiers texte, et normalise les chemins', () => {
    const arbre = {
      'index.html': { type: 'file', content: '<script src="/src/main.tsx"></script>' },
      './src/main.tsx': { type: 'file', content: 'export {}' },
      src: { type: 'folder' },
      'logo.png': { type: 'file', content: '', isBinary: true },
      'pas-encore-charge.ts': undefined,
    };

    const fichiers = fichiersDepuisArborescence(arbre as never);

    expect(Object.keys(fichiers).sort()).toEqual(['index.html', 'src/main.tsx']);
  });

  it('un dossier, un binaire ou une entrée non chargée ne FOURNIT pas un module', () => {
    /*
     * C'est la moitié qui compte : si l'adaptateur laissait passer ces trois
     * formes, la garde croirait le point d'entrée présent et se tairait
     * précisément quand elle doit parler.
     */
    const arbre = {
      'index.html': { type: 'file', content: '<script src="/src/main.tsx"></script>' },
      'src/main.tsx': { type: 'folder' },
    };

    const constat = analyserGeneration(fichiersDepuisArborescence(arbre as never), { fermetureDeSecours: true });

    expect(constat.entreesManquantes).toEqual(['src/main.tsx']);
    expect(generationEstHonnete(constat)).toBe(false);
  });

  it('une arborescence complète et fermée proprement reste honnête', () => {
    const arbre = {
      'index.html': { type: 'file', content: '<script src="/src/main.tsx"></script>' },
      'src/main.tsx': { type: 'file', content: 'export {}' },
    };

    expect(
      generationEstHonnete(
        analyserGeneration(fichiersDepuisArborescence(arbre as never), { fermetureDeSecours: false }),
      ),
    ).toBe(true);
  });
});

describe('la garde est réellement APPELÉE par le produit', () => {
  it('useMessageParser consulte analyserGeneration quand le filet ferme un artefact', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'app/lib/hooks/useMessageParser.ts'), 'utf8');

    // Témoin positif : on lit bien le bon fichier.
    expect(source).toContain('fermerArtefactsOuverts');

    expect(source).toContain("from '~/lib/runtime/generation-incomplete'");
    expect(source).toContain('analyserGeneration(fichiersDepuisArborescence(workbenchStore.files.get())');
    expect(source).toContain("event: 'generation.tronquee'");

    // L'appel doit être DANS la branche du filet, pas sur le chemin normal.
    const branche = source.slice(source.indexOf('if (data.fermetureDeSecours) {'), source.indexOf('} else {'));
    expect(branche).toContain('analyserGeneration(');
  });
});
