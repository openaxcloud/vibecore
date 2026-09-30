import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/*
 * UNE PÉRIODE DE GRÂCE PLUS LONGUE QUE SON BUDGET TRANSFORME LE REMÈDE EN PANNE.
 *
 * Le problème que la grâce longue corrige : un pod `web` qu'on remplace avait
 * 30 s pour s'arrêter, dont 10 de drain nginx — alors qu'un tour d'agent dure
 * 2 à 4 min. Mesuré le 2026-09-30 à 18:19 : un tour réel est mort pendant le
 * déploiement de dfc23575cc, le navigateur a reçu « network error » et AUCUN pod
 * n'a de trace de fin. Ni #609 ni #622 ne peuvent rattraper : personne n'a
 * terminé la réponse.
 *
 * Mais allonger la grâce sans allonger ce qui l'attend produit pire que le
 * défaut : le déploiement expire, `--atomic` REVIENT EN ARRIÈRE, et il le fait
 * précisément les fois où un tour était protégé. On aurait détruit le travail
 * ET annulé la livraison.
 *
 * QUATRE HORLOGES COURENT PENDANT UN DÉPLOIEMENT. Elles doivent expirer dans un
 * ordre strict, du plus petit au plus grand :
 *
 *   1. la grâce d'un pod                terminationGracePeriodSeconds
 *   2. le délai de progrès Kubernetes   progressDeadlineSeconds
 *   3. le budget de `helm upgrade`      --timeout
 *   4. le plafond du job GitHub         timeout-minutes
 *
 * Deux horloges qui expirent ENSEMBLE, c'est le pire cas : celle qui rend
 * l'erreur n'est pas celle qui connaît la cause. Mesuré le 2026-09-04 (run
 * 1453) — le hook de migration et Helm étaient tous deux à 600 s : Helm a rendu
 * « context deadline exceeded » et son rollback atomique a emporté le Job de
 * migration avant que quiconque lise pourquoi. Dix minutes de silence.
 *
 * Ce garde ne prédit aucune durée : il épingle les ORDRES. C'est ce qui rougit
 * le jour où quelqu'un allonge une grâce sans toucher au reste — ou raccourcit
 * un budget sans voir qu'une grâce en dépend.
 */
const racine = join(__dirname, '..', '..');

const valeurs = parse(readFileSync(join(racine, 'infra/helm/platform/values-prod.yaml'), 'utf8')) as {
  services?: Record<string, Record<string, unknown>>;
};
const gabarit = readFileSync(join(racine, 'infra/helm/platform/templates/deployments.yaml'), 'utf8');
const migrations = readFileSync(join(racine, 'infra/helm/platform/templates/migrations-job.yaml'), 'utf8');
const workflow = readFileSync(join(racine, '.github/workflows/deploy-main.yml'), 'utf8');

/** Lit la valeur par défaut d'une clé dans le gabarit : `{{ $svc.X | default N }}`. */
function defautDuGabarit(cle: string): number {
  const m = new RegExp(`\\$svc\\.${cle}\\s*\\|\\s*default\\s+(\\d+)`, 'u').exec(gabarit);

  if (!m) {
    throw new Error(`\`${cle}\` n'a plus de défaut dans deployments.yaml : la garde ne mesure rien`);
  }

  return Number(m[1]);
}

/** Toutes les valeurs `--timeout Nm` passées à helm dans le workflow, en secondes. */
function budgetsHelm(): number[] {
  return [...workflow.matchAll(/--timeout\s+(\d+)m/gu)].map((m) => Number(m[1]) * 60);
}

/*
 * Tous les `rollout status --timeout=Nm`, en secondes.
 *
 * ⚠️ LA PREMIÈRE VERSION AVAIT UN ANGLE MORT, trouvé en écrivant la
 * contre-épreuve : elle exigeait `rollout status` et `--timeout=` sur la MÊME
 * ligne. Or l'appel de la phase 2 est coupé en deux lignes par la longueur du
 * nom de déploiement — il était donc invisible, et serait resté à 5 min sans que
 * rien ne rougisse. Une garde aveugle sur un cas est pire qu'absente : elle
 * rassure. On cherche donc le `--timeout=` dans la FENÊTRE qui suit chaque
 * `rollout status`, sauts de ligne compris.
 */
function budgetsRollout(): number[] {
  const budgets: number[] = [];

  /*
   * Seules les COMMANDES comptent. `rollout status` apparaît aussi dans des
   * `echo "::group::…"` et dans des commentaires — huit occurrences au total,
   * quatre commandes. Compter les autres faisait refuser la garde sur un
   * commentaire, ce qui est le symétrique de l'angle mort : bruyant au lieu
   * d'aveugle, mais tout aussi inutilisable.
   */
  for (const occurrence of workflow.matchAll(/^[ \t]*kubectl[^\n]*rollout status/gmu)) {
    const fenetre = workflow.slice(occurrence.index!, occurrence.index! + 300);
    const m = /--timeout=(\d+)m/u.exec(fenetre);

    if (!m) {
      throw new Error(
        `un \`rollout status\` sans \`--timeout=Nm\` lisible dans les 300 caractères qui suivent ` +
          `(offset ${occurrence.index}) : la garde ne peut pas le juger, donc elle refuse de conclure`,
      );
    }

    budgets.push(Number(m[1]) * 60);
  }

  return budgets;
}

function plafondDuJobDeDeploiement(): number {
  const bloc = workflow.slice(workflow.indexOf('build-and-deploy:'));
  const m = /timeout-minutes:\s*(\d+)/u.exec(bloc);

  if (!m) {
    throw new Error("le plafond du job build-and-deploy est introuvable : la garde ne mesure rien");
  }

  return Number(m[1]) * 60;
}

const graceParDefaut = defautDuGabarit('terminationGracePeriodSeconds');
const progresParDefaut = defautDuGabarit('progressDeadlineSeconds');
const preStopMs = defautDuGabarit('preStopDrainMs');
const attenteStable = defautDuGabarit('minReadySeconds');

/** La grâce effective de chaque service : sa surcharge, sinon le défaut du gabarit. */
const gracesEffectives = Object.entries(valeurs.services ?? {}).map(([nom, svc]) => ({
  nom,
  grace: typeof svc?.terminationGracePeriodSeconds === 'number' ? svc.terminationGracePeriodSeconds : graceParDefaut,
  progres: typeof svc?.progressDeadlineSeconds === 'number' ? svc.progressDeadlineSeconds : progresParDefaut,
}));

/*
 * Démarrage d'un pod neuf, MESURÉ et non déduit : le 2026-09-30, deux pods `web`
 * du même rollout ont été créés à 18:15:00 et 18:18:31 — 3 min 31 s d'écart, avec
 * une grâce de 30 s. On retient 240 s pour couvrir un jour plus lent.
 */
const DEMARRAGE_MESURE_S = 240;

describe('les quatre horloges du déploiement expirent dans le bon ordre', () => {
  it('TÉMOIN — les quatre valeurs sont lues, et aucune ne vaut zéro', () => {
    expect(graceParDefaut, 'grâce introuvable').toBeGreaterThan(0);
    expect(progresParDefaut, 'délai de progrès introuvable').toBeGreaterThan(0);
    expect(budgetsHelm().length, 'aucun `--timeout Nm` trouvé dans le workflow').toBeGreaterThan(0);
    expect(plafondDuJobDeDeploiement(), 'plafond du job introuvable').toBeGreaterThan(0);
    expect(gracesEffectives.length, 'aucun service lu dans values-prod.yaml').toBeGreaterThan(0);
  });

  it('1 → 2 : le délai de progrès dépasse un pas de remplacement complet, pour CHAQUE service', () => {
    for (const { nom, grace, progres } of gracesEffectives) {
      const pas = grace + attenteStable + DEMARRAGE_MESURE_S;

      expect(
        progres,
        `${nom} : un pas de remplacement coûte au plus ${pas} s (grâce ${grace} + stable ${attenteStable} + ` +
          `démarrage mesuré ${DEMARRAGE_MESURE_S}) mais progressDeadlineSeconds vaut ${progres}. ` +
          'Kubernetes marquerait ProgressDeadlineExceeded sur un rollout sain, seulement lent parce ' +
          "qu'il laisse un tour d'agent se terminer.",
      ).toBeGreaterThan(pas);
    }
  });

  it('2 → 3 : CHAQUE budget helm dépasse le délai de progrès le plus long', () => {
    const progresMax = Math.max(...gracesEffectives.map((s) => s.progres));

    for (const budget of budgetsHelm()) {
      expect(
        budget,
        `un \`helm --timeout\` vaut ${budget} s alors que le délai de progrès le plus long vaut ` +
          `${progresMax} s. Helm abandonnerait — et \`--atomic\` ramènerait la production en arrière — ` +
          'AVANT que Kubernetes ait seulement déclaré le rollout en échec. Le rollback compte aussi : ' +
          'il remplace les pods de la même façon, donc il subit la même grâce.',
      ).toBeGreaterThan(progresMax);
    }
  });

  it('2 → 3 bis : chaque `rollout status` attend plus longtemps que le délai de progrès', () => {
    const progresMax = Math.max(...gracesEffectives.map((s) => s.progres));

    for (const attente of budgetsRollout()) {
      expect(
        attente,
        `un \`rollout status --timeout\` vaut ${attente} s pour un délai de progrès de ${progresMax} s : ` +
          'il rendrait « timed out waiting » sur un rollout que Kubernetes considère encore comme en cours.',
      ).toBeGreaterThan(progresMax);
    }
  });

  it('3 → 4 : le plafond du job couvre TOUS les budgets helm qu’il contient, plus la construction', () => {
    /*
     * Le job fait deux `helm upgrade --atomic` (rollout puis armement phase 2) et
     * peut faire un `helm rollback`. Un job tué par le coureur n'écrit AUCUN
     * rapport : la production reste alors dans un état qu'on ne peut pas lire.
     */
    const CONSTRUCTION_MESUREE_S = 43 * 60;
    const somme = budgetsHelm().reduce((t, b) => t + b, 0);
    const plafond = plafondDuJobDeDeploiement();

    expect(
      plafond,
      `le job est plafonné à ${plafond} s mais contient ${budgetsHelm().length} budgets helm totalisant ` +
        `${somme} s, plus ${CONSTRUCTION_MESUREE_S} s de construction mesurée. Un job tué n'écrit rien.`,
    ).toBeGreaterThanOrEqual(somme + CONSTRUCTION_MESUREE_S);
  });

  it('le hook de migration expire AVANT le budget helm, pour nommer sa propre cause', () => {
    const m = /activeDeadlineSeconds:\s*(\d+)/u.exec(migrations);

    expect(m, '`activeDeadlineSeconds` introuvable dans migrations-job.yaml : la garde ne mesure rien').not.toBeNull();

    const hook = Number(m![1]);
    const budgetMin = Math.min(...budgetsHelm());

    expect(
      hook,
      `le hook de migration est à ${hook} s et le plus petit budget helm à ${budgetMin} s. S'ils expirent ` +
        'ensemble, Helm rend « context deadline exceeded » et son rollback emporte le Job avant que ' +
        'quiconque lise la vraie cause — mesuré le 2026-09-04, dix minutes de silence.',
    ).toBeLessThan(budgetMin);
  });

  it('CONTRE-ÉPREUVE — le préStop reste bien À L’INTÉRIEUR de la grâce', () => {
    /*
     * `preStop` court PENDANT la période de grâce, il ne s'y ajoute pas. Une
     * grâce inférieure au drain nginx enverrait SIGKILL avant même que le pod
     * soit sorti des upstreams — le 502 que tout ce dispositif existe pour
     * supprimer.
     */
    const preStopS = preStopMs / 1000;

    for (const { nom, grace } of gracesEffectives) {
      expect(grace, `${nom} : grâce ${grace} s < drain nginx ${preStopS} s`).toBeGreaterThan(preStopS);
    }
  });
});
