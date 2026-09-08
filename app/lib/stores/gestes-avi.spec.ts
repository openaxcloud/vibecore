import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { doitArreterLePreview } from './preview-recovery';

/*
 * LES QUATRE GESTES REELS D'AVI, ET LEUR SENS INVERSE.
 *
 * Le scenario du verrouillage d'ecran ne couvrait qu'un chemin. Ces gestes-la
 * passent par des chemins de demontage DIFFERENTS, et chacun tuait le serveur :
 *
 *   rechargement de page ......... demonte le provider, puis le remonte
 *   changement de panneau ........ peut demonter l'arbre selon la route
 *   fermeture d'onglet puis retour  demonte, sans remontage immediat
 *   retour au-dela de dix minutes . la moisson doit avoir fait son office
 *
 * Les trois premiers doivent LAISSER VIVRE. Le quatrieme doit ARRETER — sinon
 * on a echange un defaut visible contre une fuite.
 *
 * On lit les SITES D'APPEL dans la source : c'est la seule facon de verifier
 * qu'un geste declare la bonne raison sans monter un navigateur. Le depot
 * pratique deja cette lecture (`panel-uniformization.spec.ts`).
 */

const lire = (chemin: string) => readFileSync(new URL(`../../../${chemin}`, import.meta.url), 'utf8');

describe('les gestes qui NE DOIVENT PAS arreter le serveur', () => {
  it('le nettoyage du provider declare `demontage` — rechargement, route, onglet ferme', () => {
    const src = lire('app/lib/runtime/ProjectWorkspaceProvider.tsx');
    const nettoyage = src.slice(src.indexOf('return () => {\n      cancelled = true;'));

    expect(nettoyage, 'le nettoyage de useEffect doit exister').toContain('stopPreviewServer');

    /*
     * On lit la LIGNE d'appel, pas une fenetre de caracteres : un commentaire
     * insere devant deplacerait la fenetre et ferait rougir la sonde au lieu du
     * code — ce qui s'est produit a l'ecriture de ce test.
     */
    const ligneAppel = nettoyage.split('\n').find((l) => l.includes('stopPreviewServer(') && !l.includes('async'));

    expect(ligneAppel, "l'appel doit exister dans le nettoyage").toBeDefined();
    expect(ligneAppel, 'le demontage doit declarer sa raison, sinon il tue').toContain("raison: 'demontage'");
  });

  it('et cette raison ne tue pas', () => {
    expect(doitArreterLePreview('demontage')).toBe(false);
  });

  it('AUCUN appelant ne reste sans raison declaree', () => {
    /*
     * Le vrai risque n'est pas le site qu'on a corrige : c'est le SEPTIEME
     * qu'on ajoutera demain sans y penser. Ce test le refuse.
     */
    const fichiers = [
      'app/lib/runtime/ProjectWorkspaceProvider.tsx',
      'app/components/chat/BaseChat.tsx',
      'app/components/workbench/Workbench.client.tsx',
      'app/routes/projects.$projectId.ide.tsx',
      'app/lib/stores/workbench.ts',
    ];

    const nus: string[] = [];

    for (const f of fichiers) {
      for (const ligne of lire(f).split('\n')) {
        if (!ligne.includes('stopPreviewServer(') || ligne.includes('async stopPreviewServer')) {
          continue;
        }

        if (!ligne.includes('raison:')) {
          nus.push(`${f} :: ${ligne.trim().slice(0, 70)}`);
        }
      }
    }

    expect(nus, `appels sans raison declaree :\n${nus.join('\n')}`).toEqual([]);
  });
});

describe('le geste qui DOIT arreter le serveur', () => {
  it("« Stop » explicite arrete — l'exces inverse serait pire", () => {
    expect(doitArreterLePreview('utilisateur')).toBe(true);
  });

  it('les trois boutons Run/Stop declarent bien `utilisateur`', () => {
    for (const f of [
      'app/components/chat/BaseChat.tsx',
      'app/components/workbench/Workbench.client.tsx',
      'app/routes/projects.$projectId.ide.tsx',
    ]) {
      expect(lire(f), `${f} : le bouton Stop doit declarer l'intention`).toContain("raison: 'utilisateur'");
    }
  });
});

describe('au-dela de la fenetre, le serveur doit finir par s arreter', () => {
  it('la moisson existe et porte une borne mesuree', () => {
    /*
     * Tenu en execution par `services/workspace-agent/src/serveur-dev-survit.spec.ts`
     * (« il regarde, puis s'en va pour de bon »). Ici on epingle la BORNE : dix
     * minutes, strictement sous les trente de l'inactivite du workspace, pour
     * qu'aucun pod ne soit prolonge.
     */
    const agent = lire('services/workspace-agent/src/app.ts');

    expect(agent).toContain('WORKSPACE_DEV_SERVER_GRACE_MS');
    expect(agent, 'la fenetre doit rester sous les 30 min du workspace').toContain('10 * 60_000');
  });
});
