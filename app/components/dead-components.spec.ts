import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BUG-QA-DEAD-COMPONENTS-001 — un composant que RIEN n'importe fait croire
 * qu'un comportement existe.
 *
 * `DatabasePanel.tsx` porte un bloc d'erreur `role="alert"`, et le commentaire
 * du correctif serveur `82e27ce9d` s'appuie explicitement dessus : « les
 * panneaux rendent déjà `ok === false` — DatabasePanel a un bloc role="alert" ».
 * Il n'est importé nulle part. Le panneau réellement rendu est
 * `DatabaseWorkbench`, qui écrasait le message. Quelqu'un a lu le bon code et
 * conclu que ça marchait ; l'utilisateur, lui, voyait un écran muet
 * (BUG-DB-002).
 *
 * Ce test est un CLIQUET : il n'exige pas que les morts connus disparaissent,
 * mais interdit qu'il en apparaisse de NOUVEAUX, et force la liste à rester
 * honnête quand l'un est supprimé ou ranimé.
 *
 * Critère = un `import` RÉEL depuis un fichier non-test. Une mention en
 * commentaire ou dans une spec ne fait rien s'afficher — c'est précisément
 * l'illusion qu'on cherche à empêcher.
 */

const RACINE = join(__dirname);

/*
 * Composants sans aucun import hors test, relevés le 2026-09-01.
 *
 * Les six qui étaient ISOLÉS ont été SUPPRIMÉS — dont `DatabasePanel`, dont le
 * bloc d'erreur `role="alert"` avait fait conclure à tort que l'échec de
 * provisionnement s'affichait (BUG-DB-002). L'historique git les conserve.
 *
 * Ceux qui restent sont ENTREMÊLÉS : une spec PARTAGÉE les importe ou nomme leur
 * chemin de fichier à côté de composants VIVANTS. Les supprimer demande de
 * découper ces specs sans affaiblir ce qu'elles couvrent par ailleurs — un
 * chantier à part, fait à la main, pas un `git rm`. La raison est notée pour
 * chacun, parce qu'un mort non expliqué finit par être pris pour du code vivant.
 */
const MORTS_CONNUS = [
  /* typography-closed-scale.spec.ts nomme son chemin ; DeployRemainingComponents le monte. */
  'deploy/DeploymentTypeSelector',

  /* marketing-exact-legal-blog.spec.tsx importe son catalogue de copie. */
  'marketing/EcodeExactLegalPages',

  /* marketing-ux-audit.spec.ts lit son chemin pour vérifier l'échelle des h1. */
  'marketing/ecode-exact/pages/LegalArticle',

  /*
   * Trois specs nomment son chemin, dont une GARDE délibérée : `pricing.i18n.spec.tsx`
   * vérifie que le registre ne l'importe PAS. La vraie page est `EcodePricingPage`.
   * Le supprimer rendrait cette garde trivialement vraie — à décider ensemble.
   */
  'marketing/ecode-exact/pages/Pricing',
];

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);

    if (statSync(chemin).isDirectory()) {
      fichiers(chemin, acc);
    } else if (/\.(tsx?)$/.test(entree) && !chemin.includes('.spec.') && !chemin.includes('.test.')) {
      acc.push(chemin);
    }
  }

  return acc;
}

/** Tous les fichiers NON-test de `app/`, seuls capables de faire s'exécuter du code. */
function sourcesNonTest(): Map<string, string> {
  const out = new Map<string, string>();

  for (const chemin of fichiers(join(RACINE, '..'))) {
    out.set(chemin, readFileSync(chemin, 'utf8'));
  }

  return out;
}

function composantsMorts() {
  const sources = sourcesNonTest();
  const morts: string[] = [];

  for (const chemin of fichiers(RACINE)) {
    const relatif = chemin.slice(RACINE.length + 1).replace(/\.tsx?$/, '');
    const base = relatif.split('/').pop()!;

    if (base === 'index') {
      continue;
    }

    /*
     * Les TROIS formes qui font s'exécuter le module : `from '…/Nom'` (import
     * nommé ou ré-export), `import('…/Nom')` (paresseux) et `import '…/Nom'`
     * (effet de bord, sans liaison).
     *
     * ⚠️ La forme à effet de bord manquait, et la contre-épreuve l'a montrée :
     * importer `DatabasePanel` ainsi laissait la sonde le déclarer mort. Un
     * détecteur qui rate une forme d'import rend des faux morts — soit on
     * supprime du code vivant, soit le cliquet se desserre sans qu'on le voie.
     */
    const motif = new RegExp(String.raw`(?:\bfrom\s*|\bimport\s*\(?\s*)['"][^'"]*/${base}(?:\.js)?['"]`);
    const utilise = [...sources].some(([p, texte]) => p !== chemin && motif.test(texte));

    if (!utilise) {
      morts.push(relatif);
    }
  }

  return morts.sort();
}

describe('BUG-QA-DEAD-COMPONENTS-001 — aucun NOUVEAU composant mort', () => {
  it('la sonde lit bien l’arborescence, et un composant vivant est vu comme vivant', () => {
    /*
     * Témoin positif obligatoire : sans lui, un chemin erroné rendrait une liste
     * vide et le test « passerait » en ne mesurant rien.
     */
    const tous = fichiers(RACINE);

    expect(tous.length, 'composants examinés').toBeGreaterThan(100);
    expect(composantsMorts(), 'DatabaseWorkbench est rendu par BaseChat — il ne doit PAS être vu mort').not.toContain(
      'database/DatabaseWorkbench',
    );
  });

  it('aucun composant mort nouveau', () => {
    const nouveaux = composantsMorts().filter((c) => !MORTS_CONNUS.includes(c));

    expect(
      nouveaux,
      `Composants que plus rien n'importe. Soit les brancher, soit les supprimer.\nNe PAS les ajouter à MORTS_CONNUS sans raison écrite : ` +
        `du code mort qui a l'air vivant a déjà fait conclure à tort qu'un comportement marchait (BUG-DB-002).\n${nouveaux.join('\n')}`,
    ).toEqual([]);
  });

  it('la liste des morts connus reste honnête', () => {
    /* Un mort supprimé ou ranimé doit SORTIR de la liste, sinon le cliquet se desserre. */
    const actuels = composantsMorts();
    const perimes = MORTS_CONNUS.filter((c) => !actuels.includes(c));

    expect(perimes, `Ces entrées ne sont plus mortes (supprimées ou ranimées) — les retirer de MORTS_CONNUS`).toEqual(
      [],
    );
  });
});
