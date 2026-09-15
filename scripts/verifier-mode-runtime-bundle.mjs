#!/usr/bin/env node
/*
 * VÉRIFIE LE BUNDLE PRODUIT, PAS UNE VARIABLE D'ENVIRONNEMENT.
 *
 * `VITE_RUNTIME_MODE` est inlinée par Vite AU MOMENT DU BUILD. Contrôler la
 * variable au déploiement ne prouve donc rien sur ce que le navigateur exécute :
 * c'est exactement ce que fait `scripts/validate-production-enterprise.mjs`, et
 * c'est pourquoi il n'a rien vu.
 *
 * LES DEUX ANCRES, MESURÉES LE 2026-09-06 SUR DEUX BUILDS RÉELS
 * (`pnpm build` avec et sans la variable, 1 985 fichiers js chacun) :
 *
 *   ancre                                     sans le mode   avec le mode
 *   ----------------------------------------  ------------   ------------
 *   `return"webcontainer"` (repli replié)                 1              0
 *   `VITE_RUNTIME_MODE:"remote-kubernetes"`               0              3
 *
 * La première est le cœur du contrôle : privée de la variable, Vite remplace
 * `import.meta.env.VITE_RUNTIME_MODE` par `undefined`, et le minifieur replie
 * TOUT `getRuntimeMode()` en un `return"webcontainer"` inconditionnel. Ce repli
 * est la signature exacte du défaut — il ne peut pas exister dans une image
 * correcte.
 *
 * ⚠️ Ce qu'il ne faut PAS faire : chercher `remote-kubernetes` nu. Cette chaîne
 * apparaît **6 fois dans le bundle SANS le mode** (comparaisons de type qui
 * survivent à la minification) contre 10 avec. Un tel contrôle passerait au vert
 * sur l'image cassée — un garde creux avec l'air sérieux.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPLI_WEBCONTAINER = 'return"webcontainer"';
const ENV_ATTENDU = 'VITE_RUNTIME_MODE:"remote-kubernetes"';

export function analyserBundle(racine) {
  const fichiers = [];

  const parcourir = (dossier) => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);

      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
      } else if (chemin.endsWith('.js')) {
        fichiers.push(chemin);
      }
    }
  };

  parcourir(racine);

  let repli = 0;
  let env = 0;

  for (const fichier of fichiers) {
    const contenu = readFileSync(fichier, 'utf8');
    repli += contenu.split(REPLI_WEBCONTAINER).length - 1;
    env += contenu.split(ENV_ATTENDU).length - 1;
  }

  return { fichiersExamines: fichiers.length, repli, env };
}

export function verdict(mesure) {
  const problemes = [];

  /*
   * Un zéro n'est une information que si la recherche a porté sur quelque chose.
   * Sans ce refus, un chemin vide rendrait « aucun repli trouvé » — indiscernable
   * d'un bundle sain.
   */
  if (mesure.fichiersExamines === 0) {
    problemes.push("aucun fichier .js examiné : le chemin est vide ou n'est pas un bundle client");

    return { ok: false, problemes };
  }

  if (mesure.repli > 0) {
    problemes.push(
      `le bundle contient ${mesure.repli}× \`${REPLI_WEBCONTAINER}\` : getRuntimeMode() a été replié ` +
        'sur son défaut, donc VITE_RUNTIME_MODE était absent au build. Cette image livre WebContainer ' +
        "et n'atteindra jamais workspace-manager.",
    );
  }

  if (mesure.env === 0) {
    problemes.push(
      `le bundle ne contient pas \`${ENV_ATTENDU}\` : le mode distant n'a pas été inliné. ` +
        'Construire avec --build-arg=VITE_RUNTIME_MODE=remote-kubernetes.',
    );
  }

  return { ok: problemes.length === 0, problemes };
}

const estPointDEntree = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());

if (estPointDEntree) {
  const racine = process.argv[2] ?? 'build/client';
  const mesure = analyserBundle(racine);
  const { ok, problemes } = verdict(mesure);

  console.log(`  fichiers .js examinés : ${mesure.fichiersExamines}`);
  console.log(`  \`${REPLI_WEBCONTAINER}\` : ${mesure.repli}   \`${ENV_ATTENDU}\` : ${mesure.env}`);

  if (ok) {
    console.log('  ✅ bundle en mode remote-kubernetes');
  } else {
    console.error('\n  ❌ BUNDLE REFUSÉ');
    problemes.forEach((p) => console.error(`     - ${p}`));
    process.exit(1);
  }
}
