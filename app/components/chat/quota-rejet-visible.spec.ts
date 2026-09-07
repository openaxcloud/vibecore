import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-CREATE-002 — le rejet de quota est produit, mais n'était atteignable
 * par AUCUN clic : le seul signal (« ! ») était posé sur la pastille
 * « espace de travail », dont le clic ouvrait la vue `terminal` (le Shell),
 * alors que le message est rendu dans la vue `problems`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER MESURE, ET CE QU'IL NE PEUT PAS MESURER
 *
 * Le défaut vit dans une expression de BaseChat.tsx (23 000 lignes, modifié par
 * plusieurs sessions chaque jour, dernière écriture il y a sept heures). Le vrai
 * remède serait d'extraire la règle « quel panneau ouvre ce clic » dans une
 * fonction pure et de l'EXÉCUTER. Ce n'est pas fait ici : un refactor de
 * production dans un fichier disputé n'a pas sa place dans un correctif de
 * garde, et le risque de conflit dépasse le gain.
 *
 * À défaut, on ne lit pas le texte « à peu près » : on ISOLE le bouton, on
 * ANALYSE son ternaire (condition / branche vraie / branche fausse) et on
 * vérifie la RELATION. La version précédente affirmait « `openBottomTerminal(`
 * suivi de `quotaWarning` puis de `'problems'` » : un ordre, que la lecture de
 * texte ne peut pas honnêtement affirmer — et qui laissait passer l'échange des
 * deux branches, c'est-à-dire le défaut lui-même.
 */

const racine = join(__dirname, '..', '..', '..');
const baseChat = readFileSync(join(racine, 'app/components/chat/BaseChat.tsx'), 'utf8');
const diagnostics = readFileSync(join(racine, 'app/lib/stores/diagnostics.ts'), 'utf8');

/** Le bouton entier, sans plafond arbitraire : jusqu'à sa balise fermante. */
function boutonPortantLaClasse(classe: string): string {
  const debut = baseChat.lastIndexOf('<button', baseChat.indexOf(classe));

  if (debut === -1) {
    return '';
  }

  const fin = baseChat.indexOf('</button>', debut);

  return fin === -1 ? '' : baseChat.slice(debut, fin + '</button>'.length);
}

/** Valeur d'un attribut JSX `nom={…}`, délimitée par appariement d'accolades. */
function attributJsx(bloc: string, nom: string): string {
  const debut = bloc.indexOf(`${nom}={`);

  if (debut === -1) {
    return '';
  }

  const ouvrante = bloc.indexOf('{', debut);

  let profondeur = 0;

  for (let i = ouvrante; i < bloc.length; i++) {
    if (bloc[i] === '{') {
      profondeur++;
    } else if (bloc[i] === '}') {
      profondeur--;

      if (profondeur === 0) {
        return bloc.slice(ouvrante + 1, i);
      }
    }
  }

  return '';
}

/**
 * Découpe `cond ? a : b` au premier niveau. C'est ce qui rend le garde
 * INSENSIBLE au formatage et SENSIBLE à l'échange des branches — le défaut.
 */
function analyserTernaire(expression: string): { condition: string; siVrai: string; siFaux: string } | null {
  let profondeur = 0;
  let point = -1;

  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];

    if (c === '(' || c === '{' || c === '[') {
      profondeur++;
    } else if (c === ')' || c === '}' || c === ']') {
      profondeur--;
    } else if (c === '?' && profondeur === 1 && point === -1) {
      point = i;
    } else if (c === ':' && profondeur === 1 && point !== -1) {
      /*
       * La branche fausse s'arrête quand la parenthèse de l'appel se referme —
       * pas à la fin de la chaîne. Relevé par la contre-épreuve sur code SAIN,
       * qui rendait `'terminal')` au lieu de `'terminal'`.
       */
      let fin = expression.length;
      let reste = profondeur;

      for (let j = i + 1; j < expression.length; j++) {
        const d = expression[j];

        if (d === '(' || d === '{' || d === '[') {
          reste++;
        } else if (d === ')' || d === '}' || d === ']') {
          reste--;

          if (reste === 0) {
            fin = j;
            break;
          }
        }
      }

      /*
       * La virgule finale que prettier ajoute aux appels multi-lignes fait
       * partie du formatage, pas de la valeur. Sans ce nettoyage, ce garde
       * rougissait sur un simple passage de prettier — contre-épreuve faite.
       */
      const valeur = (bout: string) => bout.trim().replace(/,$/, '').trim();

      return {
        condition: valeur(expression.slice(0, point)),
        siVrai: valeur(expression.slice(point + 1, i)),
        siFaux: valeur(expression.slice(i + 1, fin)),
      };
    }
  }

  return null;
}

const pastille = boutonPortantLaClasse('bolt-project-statusbar-workspace');
const onClick = attributJsx(pastille, 'onClick');
const ternaire = analyserTernaire(onClick);

describe('BUG-CREATE-002 — le rejet de quota mène quelque part', () => {
  it('la sonde a bien isolé la pastille, son clic et son ternaire', () => {
    /*
     * Règle 14 — un « 0 résultat » n'informe que si la recherche a fonctionné.
     * Sans ces trois contrôles, un renommage de classe viderait les extraits et
     * les assertions suivantes passeraient pour de mauvaises raisons.
     */
    expect(pastille, 'pastille « espace de travail » introuvable — le sélecteur a bougé').not.toBe('');
    expect(pastille, 'le bloc doit contenir sa classe').toContain('bolt-project-statusbar-workspace');
    expect(onClick, 'attribut onClick introuvable sur la pastille').not.toBe('');
    expect(ternaire, 'le clic ne choisit plus entre deux vues — vérifier la règle à la main').not.toBeNull();
  });

  it('MOITIÉ 1 (destination) — le message de quota est bien poussé dans les diagnostics', () => {
    /*
     * Sans ça, router le clic vers « Problèmes » ouvrirait un panneau VIDE.
     * C'est la vérification d'existence de ce que le correctif prétend atteindre.
     */
    expect(diagnostics).toMatch(/addDiagnostic\(\s*'error',\s*quotaWarning/);
  });

  it('MOITIÉ 1 bis (destination) — la vue « problems » existe et est traitée', () => {
    /*
     * L'ancienne version écrivait ici `toMatch(/active === 'problems'|'problems'/)`.
     * L'alternative rendait l'assertion CREUSE : n'importe quelle chaîne
     * `'problems'` du fichier la satisfaisait. On vérifie maintenant que la vue
     * est un membre déclaré du type, et qu'un chemin la traite réellement.
     */
    expect(baseChat).toMatch(/type ProjectBottomTerminalView =[^;]*'problems'/);
    expect(baseChat, 'un chemin doit distinguer la vue « problems »').toContain("view === 'problems'");
  });

  it('MOITIÉ 2 (chemin) — le « ! » du quota et le clic obéissent à la MÊME condition', () => {
    /*
     * Le cœur du correctif. On ne vérifie pas que les mots se suivent : on
     * vérifie que la condition qui AFFICHE le « ! » est celle qui CHOISIT la
     * vue, et que c'est bien « problems » qui est choisi quand elle est vraie.
     * Échanger les deux branches — le défaut d'origine — casse ici.
     */
    expect(pastille, 'la pastille porte bien le signal de quota').toMatch(/quotaWarning\s*\|\|\s*billingUpgradePrompt/);

    expect(onClick, 'le clic passe par openBottomTerminal').toContain('openBottomTerminal(');
    expect(ternaire!.condition, 'la condition du clic est celle du « ! »').toMatch(
      /quotaWarning\s*\|\|\s*billingUpgradePrompt/,
    );
    expect(ternaire!.siVrai, 'quota refusé → la vue qui contient le message').toBe("'problems'");
    expect(ternaire!.siFaux, 'sinon → le Shell, comportement d’origine').toBe("'terminal'");
  });

  it('MOITIÉ 2 bis (lisibilité) — le message est exposé sans avoir à ouvrir un panneau', () => {
    /*
     * Un clic qui mène au bon endroit ne suffit pas si rien n'invite à cliquer.
     * L'infobulle et le nom accessible portent le message lui-même.
     */
    expect(attributJsx(pastille, 'title')).toMatch(/^quotaWarning\s*\|\|/);
    expect(attributJsx(pastille, 'aria-label')).toMatch(/^quotaWarning\s*\|\|/);
  });
});
