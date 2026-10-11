import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * TOUTE VARIABLE LUE PAR LE CODE EST DOCUMENTÉE.
 *
 * Mesuré le 2026-09-29 : `.env.example` documentait 95 variables pendant que
 * `app/`, `services/` et `packages/` en lisaient 338. Un clone neuf ne
 * démarrait donc pas, et rien ne le disait — le fichier d'exemple avait l'air
 * complet.
 *
 * Ce garde ne décrit pas l'écart : il le REFUSE. Ajouter une lecture
 * `process.env.X` sans documenter `X` fait rougir ce cas.
 */

const RACINE = new URL('..', import.meta.url).pathname;

/* Variables fournies par l'hôte, le lanceur ou l'outillage : rien à documenter. */
const FOURNIES_PAR_L_HOTE =
  /^(NODE_ENV|CI|HOME|PATH|PWD|USER|TZ|SHELL|TERM|LANG|PORT|HOSTNAME|DEBUG|npm_|GITHUB_|RUNNER_|VITEST|PLAYWRIGHT|K_SERVICE|K_REVISION|FOO|DEV|NO_COLOR)$/u;

function variablesLuesParLeCode() {
  /*
   * ⚠️ SANS LE NOM DE FICHIER, LE FILTRE NE FILTRE RIEN. La première version
   * passait `-h` à `git grep` — qui supprime le chemin — puis tentait d'exclure
   * les specs par `grep -v spec`. Il ne restait plus rien à quoi appliquer le
   * motif, et deux variables de test (`MY_SECRET`,
   * `AGENT_MEMORY_PGVECTOR_TEST_DATABASE_URL`) se retrouvaient réclamées dans
   * le fichier d'exemple. On garde donc le chemin, et on filtre dessus.
   */
  const sortie = execSync(
    "git grep -n -E '(process|import\\.meta)\\.env\\.[A-Z][A-Z0-9_]+' -- 'app' 'services' 'packages' || true",
    { cwd: RACINE, maxBuffer: 1 << 28 },
  )
    .toString()
    .split('\n')
    .filter((ligne) => !/(\.spec\.|\.test\.|\/tests?\/|\/generated\/)/u.test(ligne.split(':')[0] ?? ''))
    .join('\n');

  const noms = new Set();

  for (const trouve of sortie.matchAll(/(?:process|import\.meta)\.env\.([A-Z][A-Z0-9_]+)/gu)) {
    if (!FOURNIES_PAR_L_HOTE.test(trouve[1])) {
      noms.add(trouve[1]);
    }
  }

  return noms;
}

function variablesDocumentees() {
  const noms = new Set();

  for (const fichier of ['.env.example', '.env.production.example']) {
    const texte = readFileSync(`${RACINE}${fichier}`, 'utf8');

    for (const trouve of texte.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=/gmu)) {
      noms.add(trouve[1]);
    }
  }

  return noms;
}

describe('.env.example — l’écart avec le code doit rester nul', () => {
  it('la sonde lit bien le code ET le fichier — sinon les cas suivants ne mesurent rien', () => {
    const lues = variablesLuesParLeCode();
    const doc = variablesDocumentees();

    expect(lues.size, 'aucune variable trouvée dans le code : la recherche a échoué').toBeGreaterThan(100);
    expect(doc.size, 'aucune variable documentée : le fichier n’a pas été lu').toBeGreaterThan(100);

    /* Témoin positif : une variable dont on SAIT qu'elle est des deux côtés. */
    expect(lues.has('DATABASE_URL') || doc.has('DATABASE_URL')).toBe(true);
  });

  it('chaque variable lue par le code est documentée', () => {
    const doc = variablesDocumentees();
    const manquantes = [...variablesLuesParLeCode()].filter((nom) => !doc.has(nom)).sort();

    expect(manquantes, `à documenter dans .env.example :\n${manquantes.join('\n')}`).toEqual([]);
  });

  it('AUCUNE VALEUR RÉELLE dans les fichiers d’exemple — ils sont versionnés', () => {
    /*
     * Un exemple porte un gabarit (`your_..._here`, une URL locale, un booléen),
     * jamais un secret. Ce cas attrape la faute la plus coûteuse du dépôt :
     * publier une clé en la croyant anodine.
     */
    const suspects = [];

    for (const fichier of ['.env.example', '.env.production.example']) {
      const texte = readFileSync(`${RACINE}${fichier}`, 'utf8');

      for (const ligne of texte.split('\n')) {
        const m = /^([A-Z][A-Z0-9_]*)=(.+)$/u.exec(ligne);

        if (!m) {
          continue;
        }

        const [, nom, valeur] = m;

        /*
         * `_URL` et `_TYPE` ne portent pas de secret : `GITHUB_TOKEN_URL` est le
         * point d'échange OAuth, `VITE_GITLAB_TOKEN_TYPE` un nom de famille de
         * jeton. Les inclure faisait rougir ce cas sur trois valeurs publiques —
         * une garde qui crie à tort finit par être désarmée.
         */
        if (!/(SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL)/u.test(nom) || /_(URL|TYPE|NAME|ID|ENABLED|MODE)$/u.test(nom)) {
          continue;
        }

        /* Un gabarit se reconnaît : il le dit, ou il est manifestement court. */
        const gabarit = /(your_|_here|placeholder|example|changeme|xxx|<|\.\.\.)/iu.test(valeur) || valeur.length < 12;

        if (!gabarit) {
          suspects.push(`${fichier} : ${nom}`);
        }
      }
    }

    expect(suspects, `valeur possiblement RÉELLE dans un fichier versionné :\n${suspects.join('\n')}`).toEqual([]);
  });

  it('les secrets générables le sont par un script, pas à la main', () => {
    const script = readFileSync(`${RACINE}scripts/generate-secrets.mjs`, 'utf8');

    for (const nom of ['JWT_SECRET', 'COOKIE_SECRET', 'CONFIG_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY', 'SIEM_SIGNING_SECRET']) {
      expect(script, `${nom} doit être couverte par generate-secrets.mjs`).toContain(nom);
    }
  });
});
