import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/*
 * UNE VALEUR POSÉE DANS values-prod.yaml N'ATTEINT PAS LA PRODUCTION.
 *
 * Ce garde existe parce que le cas s'est produit en entier, du commit au
 * déploiement servi, sans qu'une seule lumière rougisse.
 *
 * MESURÉ le 2026-10-11 à 04:41 UTC. #647 — « la grâce laisse les tours finir » —
 * venait d'être fusionné, construit, déployé et servi : run 38109565286 en
 * `success`, les huit services sur le tag `3eb0b4a1e0`, 8/8 prêts, 0 redémarrage.
 * Le pod `web` réellement en cours portait :
 *
 *     terminationGracePeriodSeconds : 30        ← et non 600
 *     progressDeadlineSeconds       : 1200      ← celui-là était bien arrivé
 *
 * #647 était donc fusionné, servi, et INOPÉRANT. Le défaut qu'il visait — un tour
 * d'agent de 2 à 4 min tué au bout de 30 s pendant un remplacement de pod — était
 * intact.
 *
 * POURQUOI. Le déploiement appelle `helm upgrade … --reuse-values`. Ce drapeau
 * conserve les valeurs STOCKÉES DANS LA RELEASE et n'ouvre jamais
 * values-prod.yaml. Deux chemins seulement atteignent la production :
 *
 *   1. un défaut de GABARIT — `{{ $svc.X | default N }}` dans deployments.yaml ;
 *   2. un `--set` explicite dans le workflow de déploiement.
 *
 * #647 changeait trois horloges. Le délai de progrès (600 → 1200 s) était un
 * défaut de gabarit : arrivé. Les budgets helm vivaient dans le workflow :
 * arrivés. La grâce (30 → 600 s) n'avait que values-prod.yaml : restée au
 * vestiaire. Le workflow dit lui-même ce piège, deux fois, en commentaire —
 * « a change to values-prod.yaml alone never reaches prod ». Le savoir était
 * écrit ; rien ne le FAISAIT RESPECTER.
 *
 * POURQUOI LA GARDE EXISTANTE NE POUVAIT PAS LE VOIR.
 * tests/guards/budget-drain-deploiement.spec.ts a sept cas, tous justes : il lit
 * values-prod.yaml et le gabarit, puis vérifie que les horloges expirent dans le
 * bon ORDRE. Il mesure la cohérence des valeurs ENTRE ELLES. Il ne demande à
 * aucun moment si une valeur ARRIVE. Deux gardes, deux questions différentes :
 * l'autre demande « ces nombres sont-ils compatibles ? », celui-ci demande
 * « ce nombre est-il celui qui tourne ? ».
 *
 * CE QUE CE GARDE ÉPINGLE, dans les deux sens (règle 6) :
 *   — retirer le `--set` du workflow rougit, alors même que values-prod.yaml
 *     garde sa belle valeur et que tout a l'air juste ;
 *   — changer le nombre d'un seul côté rougit, donc les deux ne peuvent pas
 *     divergere en silence — c'est ce qui rend le doublon acceptable.
 *
 * ET IL REFUSE DE MESURER DANS LE VIDE (règle 14) : si l'extraction ne trouve
 * rien d'un côté comme de l'autre, le cas ÉCHOUE au lieu de passer au vert. Un
 * « 0 trouvé » venu d'un motif cassé se lirait sinon comme « rien à signaler »,
 * qui est exactement l'erreur que ce garde est censé rendre impossible.
 */
const racine = join(__dirname, '..', '..');

const valeursProd = readFileSync(join(racine, 'infra/helm/platform/values-prod.yaml'), 'utf8');
const gabarit = readFileSync(join(racine, 'infra/helm/platform/templates/deployments.yaml'), 'utf8');
const workflow = readFileSync(join(racine, '.github/workflows/deploy-main.yml'), 'utf8');

/*
 * Les horloges par service que `--reuse-values` peut geler. On ne liste que
 * celles dont une valeur fausse se paie en production : une grâce trop courte
 * tue un tour, un délai de progrès trop court fait revenir une livraison saine
 * en arrière, un drain trop court coupe des connexions établies.
 */
const HORLOGES = [
  'terminationGracePeriodSeconds',
  'progressDeadlineSeconds',
  'preStopDrainMs',
  'minReadySeconds',
] as const;

/** Ce que values-prod.yaml DEMANDE, par service et par horloge. */
function demandeParValeurs(): Map<string, number> {
  const racineYaml = parse(valeursProd) as { services?: Record<string, Record<string, unknown>> };
  const services = racineYaml.services ?? {};
  const out = new Map<string, number>();

  for (const [service, conf] of Object.entries(services)) {
    for (const horloge of HORLOGES) {
      const v = (conf as Record<string, unknown>)[horloge];

      if (typeof v === 'number') {
        out.set(`${service}.${horloge}`, v);
      }
    }
  }

  return out;
}

/** Ce que le workflow RÉ-AFFIRME par `--set services.<svc>.<horloge>=<n>`. */
function reaffirmeParWorkflow(): Map<string, number> {
  const out = new Map<string, number>();
  const motif = new RegExp(
    `--set(?:-string)?\\s+"?services\\.([A-Za-z0-9]+)\\.(${HORLOGES.join('|')})=(\\d+)"?`,
    'gu',
  );

  for (const m of workflow.matchAll(motif)) {
    out.set(`${m[1]}.${m[2]}`, Number(m[3]));
  }

  return out;
}

/** Les horloges qui ont un défaut de GABARIT : celles-là arrivent sans `--set`. */
function horlogesAvecDefautDeGabarit(): Set<string> {
  const out = new Set<string>();

  for (const horloge of HORLOGES) {
    if (new RegExp(`\\$svc\\.${horloge}\\s*\\|\\s*default\\s+\\d+`, 'u').test(gabarit)) {
      out.add(horloge);
    }
  }

  return out;
}

describe('une horloge posée dans values-prod.yaml doit ATTEINDRE la production', () => {
  const demande = demandeParValeurs();
  const reaffirme = reaffirmeParWorkflow();
  const defauts = horlogesAvecDefautDeGabarit();

  it('TÉMOIN — les trois lectures ont réellement lu quelque chose', () => {
    /*
     * Sans ce cas, un motif cassé rendrait zéro des deux côtés et tous les
     * autres cas passeraient au vert en ne comparant rien. C'est la panne qui a
     * laissé #647 partir : une mesure qui n'avait rien mesuré.
     */
    expect(valeursProd.length, 'values-prod.yaml est vide').toBeGreaterThan(1000);
    expect(workflow.length, 'deploy-main.yml est vide').toBeGreaterThan(1000);
    expect(
      defauts.size,
      `aucune des horloges ${HORLOGES.join(', ')} n'a de défaut dans deployments.yaml : ` +
        'le gabarit a été réécrit, ou les noms ont changé — cette garde ne mesure plus rien',
    ).toBeGreaterThan(0);
    expect(
      demande.size + reaffirme.size,
      'ni values-prod.yaml ni le workflow ne portent une seule horloge par service : ' +
        'les deux extractions sont probablement cassées',
    ).toBeGreaterThan(0);
  });

  it('CŒUR — chaque horloge demandée par values-prod.yaml est ré-affirmée par un `--set`', () => {
    /*
     * `--reuse-values` ignore values-prod.yaml. Une horloge qui n'est QUE
     * là-dedans ne part pas : c'est littéralement ce qui est arrivé à la grâce
     * de #647, servie et inopérante pendant tout le temps où personne ne
     * regardait le pod.
     */
    const manquantes = [...demande.keys()].filter((cle) => !reaffirme.has(cle));

    expect(
      manquantes,
      manquantes.length === 0
        ? ''
        : `ces horloges sont posées dans values-prod.yaml et n'atteindront JAMAIS la production, ` +
          `parce que le déploiement passe --reuse-values : ${manquantes
            .map((c) => `${c} (=${demande.get(c)})`)
            .join(', ')}. ` +
          `Ajoute un \`--set services.<svc>.<horloge>=<n>\` au \`helm upgrade\` de ` +
          `.github/workflows/deploy-main.yml, ou déplace la valeur dans le défaut du gabarit.`,
    ).toEqual([]);
  });

  it('CŒUR, autre sens — aucun `--set` ne contredit values-prod.yaml', () => {
    /*
     * Le doublon n'est acceptable que tant qu'il est tenu. Si le workflow
     * affirme 600 et le fichier de valeurs 300, la production fait 600 et la
     * lecture du fichier mentira à la prochaine personne qui l'ouvre.
     */
    const divergentes = [...reaffirme.entries()]
      .filter(([cle, n]) => demande.has(cle) && demande.get(cle) !== n)
      .map(([cle, n]) => `${cle} : workflow ${n} ≠ values-prod.yaml ${demande.get(cle)}`);

    expect(
      divergentes,
      divergentes.length === 0
        ? ''
        : `le workflow et values-prod.yaml ne disent pas la même chose — la production suit le ` +
          `workflow, le fichier mentira à qui le lit : ${divergentes.join(' ; ')}`,
    ).toEqual([]);
  });

  it("la grâce de web, le cas qui a coûté — 600 s des DEUX côtés, et c'est mesuré", () => {
    /*
     * Un cas nommé en plus de la règle générale. Si quelqu'un retire la grâce de
     * values-prod.yaml, la règle générale ci-dessus devient vide et passe au
     * vert sans rien dire : « plus aucune horloge demandée, donc aucune
     * manquante ». Ce cas-ci refuse ce vert-là.
     */
    expect(
      demande.get('web.terminationGracePeriodSeconds'),
      'values-prod.yaml ne demande plus de grâce longue pour web — or un tour d\'agent dure ' +
        '2 à 4 min et la grâce par défaut est de 30 s (mesuré le 2026-09-30 à 18:19 : tour mort, ' +
        '« network error », aucune trace de fin)',
    ).toBe(600);
    expect(
      reaffirme.get('web.terminationGracePeriodSeconds'),
      'le `--set` de la grâce a disparu du workflow : values-prod.yaml aura beau dire 600, ' +
        '`--reuse-values` laissera la production à 30 — exactement l\'état mesuré le 2026-10-11 ' +
        'à 04:41 UTC, après un déploiement de #647 pourtant réussi de bout en bout',
    ).toBe(600);
  });

  it("le `--set` est bien dans l'upgrade QUI REMPLACE LES PODS, pas dans une étape conditionnelle", () => {
    /*
     * Un `--set` placé dans l'armement de phase 2 ne servirait presque jamais :
     * cette étape est conditionnée à un cutover. La grâce doit être posée par
     * l'upgrade qui fait rouler les pods, sinon elle n'est là que les jours de
     * bascule.
     */
    const etape = workflow.split(/^      - name: /mu).find((bloc) => bloc.startsWith('Helm upgrade'));

    expect(etape, "l'étape « Helm upgrade » a été renommée : cette garde ne la trouve plus").toBeTruthy();
    expect(
      etape,
      'le `--set` de la grâce n\'est pas dans l\'étape « Helm upgrade » — s\'il est ailleurs, ' +
        'il ne part pas à chaque déploiement',
    ).toMatch(/--set\s+"?services\.web\.terminationGracePeriodSeconds=600"?/u);
    expect(
      etape,
      "l'upgrade qui porte la grâce doit aussi porter --reuse-values : sans lui, cette garde " +
        'surveille une commande qui n\'est plus celle qui déploie',
    ).toMatch(/--reuse-values/u);
  });
});
