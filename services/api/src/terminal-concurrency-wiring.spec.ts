import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BUG-QUOTA-001, SECOND MÉCANISME — la route doit CONSOMMER le registre.
 *
 * Le correctif en a deux :
 *   1. Le registre ne facture qu'à la transition 0→1 et ne rembourse qu'à 1→0.
 *      Tenu par `terminal-concurrency.spec.ts`, qui EXÉCUTE le registre.
 *   2. La route `/terminal` l'APPELLE réellement. C'est ce fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER LIT ENCORE LA SOURCE, ET CE QUE ÇA COÛTE
 *
 * Un test de comportement serait meilleur : monter l'app avec `buildApiApp`,
 * ouvrir deux sockets sur le même `sessionId`, vérifier qu'un seul créneau est
 * facturé. Le patron existe déjà dans ce dépôt (`tests/security-routes.spec.ts`
 * monte l'app de cette façon) — donc l'obstacle n'est PAS architectural.
 *
 * Il est d'INSTALLATION : dans cet environnement, l'arbre de dépendances de
 * `services/api` est incomplet — `@e-code/sdk`, `@vibecore/*`, puis
 * `@xmldom/xmldom`, `xml-crypto`, `@google-cloud/storage` et leur transitif
 * manquent. Mesuré : `security-routes.spec.ts`, un spec EXISTANT de `main`, ne
 * démarre pas non plus ici. En intégration continue, où l'installation est
 * complète, ce test de comportement est parfaitement écrivable — et il devrait
 * l'être. La dette est notée pour qui disposera d'un arbre complet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER MESURE À LA PLACE, ET COMMENT
 *
 * Pas de PROXIMITÉ. La version précédente affirmait « `catch` suivi, à moins de
 * quatre cents caractères, de `releaseTerminalSlot` » : une lecture de texte
 * peut honnêtement affirmer une présence, jamais une distance. Un tel garde
 * rougit sur un reformatage anodin ET laisse passer un défaut écrit autrement.
 *
 * On mesure des relations de CONTENANCE, par appariement d'accolades : tel
 * appel est-il À L'INTÉRIEUR de tel bloc. La contenance survit au reformatage
 * et au réordonnancement ; elle casse quand le défaut revient.
 *
 * ⚠️ On mesure le code SANS ses commentaires : la prose autour de la route cite
 * `acquireTerminalSlot`, donc un test lisant le fichier brut passerait même si
 * l'appel avait disparu.
 */

const SOURCE = readFileSync(join(__dirname, 'app.ts'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * Un appel du registre, quel que soit son formatage. Contre-épreuve : reformater
 * `acquireTerminalSlot(a, b)` sur trois lignes est ANODIN et faisait rougir la
 * version littérale de ce garde — un garde qui punit un passage de prettier
 * finit par être supprimé, pas corrigé.
 */
const appelRegistre = (nom: string) => new RegExp(`${nom}\\(\\s*organizationId,\\s*sessionSlotKey,?\\s*\\)`);

/** Bloc `{ … }` qui suit `ancre`, délimité par appariement d'accolades. */
function blocApres(source: string, ancre: string, depuis = 0): string {
  const debut = source.indexOf(ancre, depuis);

  if (debut === -1) {
    return '';
  }

  const ouvrante = source.indexOf('{', debut + ancre.length);

  if (ouvrante === -1) {
    return '';
  }

  let profondeur = 0;

  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') {
      profondeur++;
    } else if (source[i] === '}') {
      profondeur--;

      if (profondeur === 0) {
        return source.slice(ouvrante, i + 1);
      }
    }
  }

  return '';
}

/* La porte de facturation : tout ce qui coûte doit vivre DEDANS. */
const porteDeFacturation = blocApres(CODE, 'if (chargeSlot)');

/* Le rattrapage de refus de quota, cherché DANS la porte — pas ailleurs. */
const rattrapageDeRefus = blocApres(porteDeFacturation, 'catch (error)');

/*
 * Le remboursement à la fermeture du socket. On cherche APRÈS la porte : `.onClose(`
 * apparaît plusieurs fois dans app.ts, et l'ancre nue attrapait le mauvais bloc —
 * relevé par la contre-épreuve sur code SAIN, qui a rougi. Une ancre ambiguë est
 * un faux négatif de mesure, pas un défaut du code.
 */
const fermetureDuSocket = blocApres(CODE, '.onClose(', CODE.indexOf('if (chargeSlot)'));

describe('BUG-QUOTA-001 — câblage de la route terminal sur le registre', () => {
  it('la sonde lit bien du code, et les commentaires en sont retirés', () => {
    expect(CODE.length, 'source lue').toBeGreaterThan(100000);
    expect(CODE, 'les commentaires doivent être retirés').not.toContain('le créneau appartient à la SESSION');
  });

  it('les trois blocs mesurés ont bien été isolés', () => {
    /*
     * Règle 14 — un « 0 résultat » n'informe que si la recherche a fonctionné.
     * Si un renommage déplace une ancre, les blocs sont vides et TOUTES les
     * assertions de contenance ci-dessous passeraient pour de mauvaises raisons.
     */
    expect(
      porteDeFacturation,
      'bloc `if (chargeSlot)` introuvable — si la variable de porte a été RENOMMÉE, ' +
        'mettez à jour l’ancre ci-dessus : la porte est le contrat que ce fichier tient.',
    ).not.toBe('');
    expect(rattrapageDeRefus, 'bloc `catch` introuvable DANS la porte').not.toBe('');
    expect(fermetureDuSocket, 'bloc `.onClose` introuvable').not.toBe('');
    expect(fermetureDuSocket, 'et c’est bien CELUI du terminal, pas un autre socket').toContain('released');
  });

  it('la prise de créneau passe par le registre, clé sur le sessionId', () => {
    /* Forme libre : un `if/else` vaut le ternaire, seul l'appel compte. */
    expect(CODE).toMatch(appelRegistre('acquireTerminalSlot'));
    expect(CODE, 'la clé vient du sessionId de la requête').toMatch(/sessionSlotKey\s*=/);
  });

  it('CONTENANCE — le quota n’est consommé QUE derrière la porte du registre', () => {
    /*
     * C'est le cœur du second mécanisme. Sortir `ensureQuota` de la porte, ou
     * la porte du chemin, rend le quota consommé à chaque CONNEXION au lieu de
     * chaque SESSION : c'est exactement le défaut d'origine.
     */
    expect(porteDeFacturation, 'ensureQuota doit vivre DANS `if (chargeSlot)`').toContain(
      "ensureQuota(request, organizationId, 'terminals.concurrent')",
    );
    expect(porteDeFacturation, 'et le +1 aussi').toMatch(/recordUsage\([^)]*'terminals\.concurrent',\s*1/);
  });

  it('CONTENANCE — un refus de quota rend la prise, dans le catch de la porte', () => {
    /*
     * Sans ça, la session refusée reste marquée vivante : la reconnexion
     * suivante se croit en rattachement et passe SANS être facturée.
     */
    expect(rattrapageDeRefus).toMatch(appelRegistre('releaseTerminalSlot'));
    expect(rattrapageDeRefus, 'et l’erreur doit continuer de remonter').toContain('throw error');
  });

  it('CONTENANCE — la fermeture du socket rembourse le registre puis la jauge', () => {
    expect(fermetureDuSocket).toMatch(appelRegistre('releaseTerminalSlot'));
    expect(fermetureDuSocket, 'le -1 de la jauge').toMatch(/recordUsage\([^)]*'terminals\.concurrent',\s*-1/);
  });

  it('CE QUE CE FICHIER NE PEUT PAS TENIR — dette assumée, pas oubli', () => {
    /*
     * Une lecture de source ne voit pas circuler une VALEUR. Si quelqu'un écrit
     * `const chargeSlot = true;` en laissant l'appel `acquireTerminalSlot(...)
     * ` ailleurs dans la route, tout ci-dessus reste VERT et le quota redevient
     * par connexion. Vérifié en réintroduisant exactement ce défaut.
     *
     * Seul un test qui EXÉCUTE la route l'attrape. Il est écrivable dès que
     * l'arbre de dépendances est complet (voir l'en-tête). Cette assertion ne
     * garde rien : elle existe pour que la limite soit lue, pas devinée.
     */
    expect(true).toBe(true);
  });
});
