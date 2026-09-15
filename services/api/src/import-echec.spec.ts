import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import publicCopy from './app-public-copy.json' with { type: 'json' };
import { classerEchecDImport } from './import-echec.js';

/*
 * BUG-CREATE-005 — « l'import GitHub échoue au bout de 3 minutes sur un message
 * générique ».
 *
 * Ce fichier tient DEUX moitiés qui doivent rester couplées (règle 6) :
 *   1. le classement lui-même — un échec de clone rend un statut qui distingue
 *      les causes ;
 *   2. la GARDE de câblage — les deux routes d'import passent par le seul point
 *      qui `try`. Sans elle, le correctif se défait en supprimant un `try`, sans
 *      qu'aucun test ne rougisse (règle 15 : le défaut dominant n'est pas la
 *      correction manquante, c'est la garde manquante).
 */

const RACINE = join(process.cwd(), '..', '..');
const APP_BRUT = readFileSync(join(RACINE, 'services/api/src/app.ts'), 'utf8');

/*
 * Règle 5 — ancrer sur du CODE, jamais sur de la prose. La première version de
 * ces gardes comptait 2 appels à `gitProvider.importRepository(` alors qu'il
 * n'y en a qu'UN : le second était dans le commentaire qui explique le
 * correctif. Un test qui lit les commentaires rougit quand on reformule une
 * phrase et se tait quand on casse le code — l'inverse exact de ce qu'on veut.
 */
function sansCommentaires(source: string) {
  return source
    .split('\n')
    .filter((ligne) => {
      const nu = ligne.trimStart();
      return !nu.startsWith('*') && !nu.startsWith('/*') && !nu.startsWith('//');
    })
    .join('\n');
}

const APP = sansCommentaires(APP_BRUT);

/*
 * Les formes ci-dessous ne sont pas inventées : elles ont été MESURÉES le
 * 2026-09-10 avec `promisify(execFile)` (règle 11). Le délai dépassé vient d'un
 * `sleep 5` coupé à 200 ms ; l'hôte injoignable, d'un vrai `git clone` vers un
 * domaine `.invalid`.
 */
const DELAI_DEPASSE_MESURE = Object.assign(new Error('Command failed: git clone …\n'), {
  killed: true,
  signal: 'SIGTERM',
  code: null,
  stderr: '',
});

const HOTE_INJOIGNABLE_MESURE = Object.assign(new Error('Command failed: git clone …\n'), {
  killed: false,
  signal: null,
  code: 128,
  stderr: "Cloning into '/tmp/x'...\nfatal: unable to access 'https://hote.invalid/a/b.git/': CONNECT tunnel failed, response 403\n",
});

describe('classerEchecDImport — chaque cause a son statut', () => {
  it('un délai de clone dépassé rend 504, pas 500', () => {
    expect(classerEchecDImport(DELAI_DEPASSE_MESURE)).toEqual({
      statusCode: 504,
      code: 'IMPORT_CLONE_TIMEOUT',
    });
  });

  it('un hôte injoignable rend 502 — le problème ne vient pas du dépôt', () => {
    expect(classerEchecDImport(HOTE_INJOIGNABLE_MESURE)).toEqual({
      statusCode: 502,
      code: 'IMPORT_UPSTREAM_UNREACHABLE',
    });
  });

  it.each([
    ['dépôt privé sur GitHub', 'remote: Repository not found.\nfatal: repository not found'],
    ['identifiants manquants', "fatal: could not read Username for 'https://github.com': No such device or address"],
    ['clé SSH refusée', 'git@github.com: Permission denied (publickey).'],
    ['authentification refusée', 'remote: Authentication failed for …'],
  ])('%s rend 404 — « réessayez » y serait un conseil faux', (_cas, stderr) => {
    expect(classerEchecDImport(Object.assign(new Error('Command failed'), { stderr }))).toEqual({
      statusCode: 404,
      code: 'IMPORT_REPOSITORY_UNREACHABLE',
    });
  });

  /*
   * Le piège que ce cas épingle : `git` enveloppe un 403 dans « unable to
   * access », qui est AUSSI la signature d'un hôte injoignable. Sans les
   * signatures `returned error: 4xx`, un refus d'autorisation s'annonçait comme
   * une panne d'hébergeur — et disait à l'utilisateur d'attendre au lieu de se
   * connecter.
   */
  it('un 403 emballé dans « unable to access » reste un problème d’autorisation', () => {
    const stderr =
      "fatal: unable to access 'https://github.com/acme/prive.git/': The requested URL returned error: 403";

    expect(classerEchecDImport(Object.assign(new Error('Command failed'), { stderr }))).toEqual({
      statusCode: 404,
      code: 'IMPORT_REPOSITORY_UNREACHABLE',
    });
  });

  it('une cause inconnue garde le 500 générique plutôt que d’en inventer une', () => {
    expect(classerEchecDImport(new Error('quelque chose d’imprévu'))).toEqual({
      statusCode: 500,
      code: 'IMPORT_FAILED',
    });
  });

  it.each([[undefined], [null], ['une chaîne'], [42]])('ne casse pas sur une erreur non-objet (%s)', (erreur) => {
    expect(classerEchecDImport(erreur).statusCode).toBe(500);
  });
});

describe('rien de ce que `git` a écrit ne ressort du classeur (règle 12)', () => {
  it('un jeton présent dans le stderr et dans le message ne survit pas au classement', () => {
    const jeton = 'ghp_UNJETONQUINEDOITJAMAISSORTIR';
    const erreur = Object.assign(new Error(`Command failed: git clone https://x-access-token:${jeton}@github.com/a/b.git`), {
      stderr: `fatal: unable to access 'https://x-access-token:${jeton}@github.com/a/b.git/'`,
    });

    const rendu = JSON.stringify(classerEchecDImport(erreur));

    expect(rendu).not.toContain(jeton);
    expect(rendu).not.toContain('x-access-token');
    expect(rendu).not.toContain('github.com');
  });

  it('le classeur ne rend QUE `statusCode` et `code`', () => {
    expect(Object.keys(classerEchecDImport(HOTE_INJOIGNABLE_MESURE)).sort()).toEqual(['code', 'statusCode']);
  });
});

describe('chaque code a une phrase publique — sinon le client rend du vide', () => {
  const codes = [
    'IMPORT_CLONE_TIMEOUT',
    'IMPORT_REPOSITORY_UNREACHABLE',
    'IMPORT_UPSTREAM_UNREACHABLE',
    'IMPORT_FAILED',
  ] as const;

  it.each(codes)('%s existe en anglais ET en français', (code) => {
    const entree = (publicCopy as Record<string, { en?: string; fr?: string } | undefined>)[code];

    expect(entree?.en, `${code}.en manquant`).toBeTruthy();
    expect(entree?.fr, `${code}.fr manquant`).toBeTruthy();
  });

  it('aucune de ces phrases ne dit seulement « réessayez » sur une cause qui ne le permet pas', () => {
    const depot = (publicCopy as Record<string, { en: string; fr: string }>).IMPORT_REPOSITORY_UNREACHABLE;

    /* Un dépôt privé ne s'ouvre pas en réessayant : la phrase doit dire quoi faire. */
    expect(`${depot.en} ${depot.fr}`.toLowerCase()).toMatch(/public|access|acc[eè]s|url/);
  });
});

describe('GARDE — les deux routes d’import passent par le point qui `try`', () => {
  it('le retrait des commentaires a bien retiré quelque chose (règle 14)', () => {
    /* Un « 0 résultat » n'informe que si la recherche a tourné sur la bonne cible. */
    expect(APP_BRUT.length).toBeGreaterThan(APP.length);
    expect(APP_BRUT).toContain('`gitProvider.importRepository(...)` sans `try`');
    expect(APP).not.toContain('`gitProvider.importRepository(...)` sans `try`');
  });

  /*
   * Règle 7 : GitHub d'un côté, GitLab/Bitbucket de l'autre, un seul mécanisme.
   * Si un jour quelqu'un rappelle `importRepository` directement dans une route,
   * ce test rougit AVANT que l'utilisateur ne revoie « Réessayez ».
   */
  it('`gitProvider.importRepository` n’est appelé qu’à un seul endroit dans app.ts', () => {
    const appels = APP.match(/gitProvider\.importRepository\(/g) ?? [];

    expect(appels).toHaveLength(1);
  });

  it('cet unique appel est bien celui enveloppé par `clonerLeDepotPourImport`', () => {
    const corps = APP.slice(
      APP.indexOf('async function clonerLeDepotPourImport('),
      APP.indexOf('app.post(\'/orgs/:orgId/projects/import/github\''),
    );

    expect(corps).toContain('gitProvider.importRepository(');
    expect(corps).toContain('classerEchecDImport(error)');
    expect(corps.indexOf('try {')).toBeLessThan(corps.indexOf('gitProvider.importRepository('));
  });

  it('les deux routes d’import consomment le refus au lieu de l’ignorer', () => {
    const consommations = APP.match(/if \(clone\.echec\) \{/g) ?? [];

    expect(consommations).toHaveLength(2);
  });

  it('le journal ne recopie ni le stderr ni le message de `git`', () => {
    const corps = APP.slice(
      APP.indexOf('async function clonerLeDepotPourImport('),
      APP.indexOf('app.post(\'/orgs/:orgId/projects/import/github\''),
    );
    const journal = corps.slice(corps.indexOf('request.log.warn('), corps.indexOf('return { echec };'));

    expect(journal).not.toMatch(/\berror\b/);
    expect(journal).not.toContain('stderr');
  });
});
