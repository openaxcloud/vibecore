/**
 * BUG-PERF-PRELOAD-ALLROUTES — le contrôle qui mesure LE BUNDLE, pas la
 * fonction qui le découpe.
 *
 * À lancer APRÈS `pnpm run build` :
 *   node --import tsx scripts/verifier-chemin-critique.ts
 *   node --import tsx scripts/verifier-chemin-critique.ts --self-test
 *
 * Ce qu'il refuse, et pourquoi ces deux choses et pas d'autres :
 *
 *   1. Un chunk d'éditeur, de terminal ou de CodeMirror sur le chemin critique
 *      de la RACINE. Mesuré en production le 2026-08-12 : `root-*.js`
 *      importait statiquement `vendor-monaco-core` (573 Ko servis, 2,28 Mo
 *      bruts) pour n'appeler qu'une fonction de ~20 lignes, et
 *      `vendor-terminal` (81 Ko) pour une URL de feuille de style. Une page
 *      d'accueil marketing traînait donc un éditeur de code entier.
 *
 *   2. Une croissance SILENCIEUSE du total. C'est le vrai défaut : personne
 *      n'a vu ce chemin passer à 96 imports. Le cliquet oblige à REGARDER.
 *
 * Ce qu'il ne fait pas : juger la taille d'un chunk isolé, ni deviner lequel
 * mériterait d'être ailleurs. Il constate, il nomme, il refuse.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  catalogueTropPetit,
  cataloguesManquants,
  chunksPortantLeTemoin,
  cleTemoin,
  fichierDuCatalogue,
  LANGUES_EMISES,
  SURFACES_EMISES,
  temoinDansLaTranchePublique,
} from '../build-config/catalogues-emis.js';
import {
  chunksInterdits,
  lireCheminCritiqueRacine,
  PLAFOND_CHEMIN_CRITIQUE_OCTETS,
} from '../build-config/chemin-critique-racine.js';

const DOSSIER_ASSETS = join(process.cwd(), 'build', 'client', 'assets');

function echouer(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

function autotest(): void {
  /*
   * Règle 14 : un contrôle qui ne sait pas refuser rendrait « vert » sur
   * n'importe quoi. On lui montre la forme EXACTE du défaut de production.
   */
  const manifesteDuDefaut =
    '{"routes":{"root":{"id":"root","imports":["/assets/vendor-react-x.js","/assets/vendor-monaco-core-x.js"]}}}';

  const imports = lireCheminCritiqueRacine(manifesteDuDefaut);

  if (!imports || chunksInterdits(imports).length !== 1) {
    echouer('autotest : le contrôle ne reconnaît plus le défaut du 2026-08-12 — il ne garde plus rien.');
  }

  const manifesteSain = '{"routes":{"root":{"id":"root","imports":["/assets/vendor-react-x.js"]}}}';
  const sains = lireCheminCritiqueRacine(manifesteSain);

  if (!sains || chunksInterdits(sains).length !== 0) {
    echouer('autotest : le contrôle refuse un chemin critique sain — il dirait « non » à tout.');
  }

  if (lireCheminCritiqueRacine('{}') !== undefined) {
    echouer('autotest : un manifeste illisible rend une liste au lieu de `undefined` — le vert serait creux.');
  }

  /*
   * Une seule tranche présente sur huit : le contrôle doit nommer les sept
   * autres. Un ancien nom SANS surface (`catalogue-en-<empreinte>.json`) ne
   * compte pour aucune — c'est ce qui a fait rougir ce contrôle le 2026-09-15,
   * et c'est bien un défaut, pas un faux positif.
   */
  const manquants = cataloguesManquants(['catalogue-en-public-0123456789.json']);

  if (manquants.join(',') !== 'en/app,fr/public,fr/app,es/public,es/app,ar/public,ar/app') {
    echouer(`autotest : le contrôle ne voit plus une tranche de catalogue manquante (${manquants.join(',')}).`);
  }

  if (cataloguesManquants(['catalogue-en-0123456789.json']).length !== 8) {
    echouer('autotest : un catalogue SANS surface est accepté — le contrôle ne verrait pas un plugin périmé.');
  }

  if (chunksPortantLeTemoin('chat.copy.x', new Map([['root-x.js', '{"chat.copy.x":"y"}']])).length !== 1) {
    echouer('autotest : le contrôle ne reconnaît plus un catalogue revenu dans un chunk de la racine.');
  }

  if (!temoinDansLaTranchePublique('chat.copy.x', '{"chat.copy.x":"y"}')) {
    echouer('autotest : le contrôle ne voit plus une clé d’IDE livrée dans la tranche publique.');
  }

  if (temoinDansLaTranchePublique('chat.copy.x', '{"common.unavailable":"y"}')) {
    echouer('autotest : le contrôle croit voir une clé d’IDE dans une tranche publique saine.');
  }

  console.log('autotest : le contrôle distingue bien le défaut, le sain et l’illisible.');
}

function verifierLeBuild(): void {
  let fichiers: string[];

  try {
    fichiers = readdirSync(DOSSIER_ASSETS);
  } catch {
    echouer(`${DOSSIER_ASSETS} est introuvable — lancez \`pnpm run build\` avant ce contrôle.`);
  }

  const manifeste = fichiers.find((nom) => /^manifest-.*\.js$/.test(nom));

  if (!manifeste) {
    echouer(`aucun manifeste React Router dans ${DOSSIER_ASSETS} — le contrôle ne mesurerait rien.`);
  }

  const imports = lireCheminCritiqueRacine(readFileSync(join(DOSSIER_ASSETS, manifeste), 'utf8'));

  if (!imports) {
    echouer(`la route racine est introuvable dans ${manifeste} — le format du manifeste a changé.`);
  }

  if (imports.length === 0) {
    // Un chemin critique VIDE n'existe pas : ce serait une lecture qui a raté.
    echouer(`${manifeste} rend zéro import pour la racine — lecture suspecte, pas un chemin critique sain.`);
  }

  const interdits = chunksInterdits(imports);

  if (interdits.length > 0) {
    echouer(
      `chunks interdits sur le chemin critique de TOUTE page (dont l’accueil marketing) : ${interdits.join(', ')} — ` +
        'c’est le défaut mesuré en production le 2026-08-12, voir build-config/chemin-critique-racine.ts',
    );
  }

  let octets = 0;

  const parTaille: Array<[string, number]> = [];

  for (const url of imports) {
    const nom = url.split('/').pop()!;

    try {
      const taille = statSync(join(DOSSIER_ASSETS, nom)).size;
      octets += taille;
      parTaille.push([nom, taille]);
    } catch {
      // Un import du manifeste sans fichier est un défaut de build en soi.
      echouer(`${nom} est déclaré sur le chemin critique mais absent du dossier d’assets.`);
    }
  }

  parTaille.sort((a, b) => b[1] - a[1]);
  console.log(`chemin critique racine : ${imports.length} imports, ${octets} octets bruts`);

  for (const [nom, taille] of parTaille.slice(0, 5)) {
    console.log(`  ${String(taille).padStart(9)}  ${nom}`);
  }

  if (octets > PLAFOND_CHEMIN_CRITIQUE_OCTETS) {
    echouer(
      `le chemin critique de la racine pèse ${octets} octets, au-dessus du cliquet ${PLAFOND_CHEMIN_CRITIQUE_OCTETS}. ` +
        'Regardez ce qui a grossi (les cinq plus gros sont listés ci-dessus) AVANT de relever le cliquet : ' +
        'c’est une croissance silencieuse de ce chemin qui a mis 654 Ko sur chaque page en août.',
    );
  }

  verifierLesCataloguesEmis(fichiers, imports);
}

/*
 * BUG-PERF-I18N-RACINE-001 — les catalogues i18n sont des JSON hors du graphe
 * JavaScript. Deux défauts possibles, deux contrôles : un JSON absent ou vide
 * (le navigateur hydraterait en « Unavailable »), et un catalogue REVENU dans
 * un chunk de la racine — la forme exacte du défaut du 2026-09-14, qu'on
 * détecte par une clé témoin lue dans le JSON émis, jamais codée en dur.
 */
function verifierLesCataloguesEmis(fichiers: string[], imports: string[]): void {
  const manquants = cataloguesManquants(fichiers);

  if (manquants.length > 0) {
    echouer(`catalogues i18n absents du build : ${manquants.join(', ')} — le plugin catalogues-i18n n’a pas émis.`);
  }

  let temoin: string | undefined;
  let francaisPublic: string | undefined;

  for (const langue of LANGUES_EMISES) {
    for (const surface of SURFACES_EMISES) {
      const nom = fichierDuCatalogue(fichiers, langue, surface)!;
      const json = readFileSync(join(DOSSIER_ASSETS, nom), 'utf8');
      const defaut = catalogueTropPetit(langue, surface, json);

      if (defaut) {
        echouer(`${nom} : ${defaut}`);
      }

      console.log(`  catalogue ${langue}/${surface} : ${nom}, ${json.length} octets`);

      if (langue === 'fr' && surface === 'app') {
        temoin = cleTemoin(json);
      }

      if (langue === 'fr' && surface === 'public') {
        francaisPublic = json;
      }
    }
  }

  if (!temoin) {
    echouer(
      'aucune clé témoin `chat.copy.*` dans la tranche `app` française — le contrôle de retour ne mesurerait rien.',
    );
  }

  /*
   * BUG-PERF-I18N-SURFACE-001 : le témoin est une clé d'IDE. La trouver dans la
   * tranche `public` signifierait que le découpage a livré le vocabulaire de
   * l'IDE à la page d'accueil — sans qu'un seul octet de JavaScript ne bouge,
   * donc invisible pour le cliquet du chemin critique.
   */
  if (francaisPublic && temoinDansLaTranchePublique(temoin, francaisPublic)) {
    echouer(
      `la clé d’IDE « ${temoin} » est dans la tranche PUBLIQUE française — ` +
        'le découpage par surface ne tient plus, la page d’accueil retélécharge le vocabulaire de l’IDE.',
    );
  }

  const chunks = new Map<string, string>();

  for (const url of imports) {
    const nom = url.split('/').pop()!;
    chunks.set(nom, readFileSync(join(DOSSIER_ASSETS, nom), 'utf8'));
  }

  const porteurs = chunksPortantLeTemoin(temoin, chunks);

  if (porteurs.length > 0) {
    echouer(
      `la clé témoin « ${temoin} » est revenue dans le JavaScript du chemin critique : ${porteurs.join(', ')} — ` +
        'c’est BUG-PERF-I18N-RACINE-001 : un catalogue i18n importé statiquement depuis root.tsx.',
    );
  }

  console.log(`  aucun des ${chunks.size} chunks de la racine ne porte la clé témoin « ${temoin} »`);
}

if (process.argv.includes('--self-test')) {
  autotest();
} else {
  verifierLeBuild();
}
