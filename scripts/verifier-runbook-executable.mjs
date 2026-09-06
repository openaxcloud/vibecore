#!/usr/bin/env node
/*
 * LE RUNBOOK DOIT RESTER EXÉCUTABLE.
 *
 * Le code a des contrôles ; la documentation de déploiement n'en avait aucun.
 * Elle vieillit donc en silence — et elle est lue précisément quand la chaîne
 * automatique est en panne, c'est-à-dire la nuit, vite, avec déjà un problème
 * sur les bras. Quatre dérives mesurées le 2026-09-06, toutes dans cette seule
 * chaîne :
 *
 *   1. `deploy-main.yml` décrit comme appelant `cloudbuild.yaml` — il ne l'a
 *      jamais fait, il utilise trois autres configurations ;
 *   2. `gcloud builds submit --config=cloudbuild.yaml --substitutions=…,
 *      _VITE_RUNTIME_MODE=…` — Cloud Build est STRICT : une clé passée mais non
 *      référencée par le template fait échouer la soumission ;
 *   3. `_DEPS_TAG`, même cause ;
 *   4. `gh workflow run … -f short_sha=<sha>` — l'entrée a été supprimée du
 *      workflow, la commande rend `HTTP 422`.
 *
 * VALIDATION SEULE. Ce contrôle ne lance aucun déploiement, aucun build, aucune
 * commande `gh` ou `gcloud` : il compare ce que les documents PRESCRIVENT à ce
 * que les fichiers du dépôt ACCEPTENT. Un test qui déploierait pour vérifier
 * qu'il peut déployer serait pire que le mal.
 *
 * Pas de dépendance YAML : celle-ci manquait sur le runner et avait déjà rendu
 * un garde muet. L'analyse se fait à l'indentation, sur les seuls blocs utiles.
 */
import { readFileSync, existsSync } from 'node:fs';

export const DOCUMENTS = ['CLAUDE.md', 'docs/DEPLOY_RUNBOOK.md'];

/** Recolle les continuations `\` et retire le balisage markdown gênant. */
export function commandes(markdown) {
  const lignes = markdown.replace(/\\\r?\n\s*/g, ' ').split(/\r?\n/);

  return lignes
    .map((l) => l.replace(/^[\s>|*-]+/, '').replace(/`/g, '').trim())
    .filter((l) => l.includes('gh workflow run') || l.includes('gcloud builds submit'));
}

/** Entrées déclarées sous `workflow_dispatch:` → `inputs:`, sans parseur YAML. */
export function entreesDeclarees(yamlSource) {
  const lignes = yamlSource.split(/\r?\n/);
  const entrees = new Set();

  let dansDispatch = false;
  let dansInputs = false;
  let indentInputs = null;

  for (const ligne of lignes) {
    if (/^\s*workflow_dispatch:\s*$/.test(ligne)) {
      dansDispatch = true;
      continue;
    }

    if (!dansDispatch) {
      continue;
    }

    if (/^\s*inputs:\s*$/.test(ligne)) {
      dansInputs = true;
      continue;
    }

    // Une clé de premier niveau (sans indentation) referme la section.
    if (/^\S/.test(ligne) && ligne.trim() !== '') {
      break;
    }

    if (!dansInputs) {
      continue;
    }

    const cle = /^(\s+)([A-Za-z_][\w-]*):\s*$/.exec(ligne);

    if (!cle) {
      continue;
    }

    if (indentInputs === null) {
      indentInputs = cle[1].length;
    }

    if (cle[1].length === indentInputs) {
      entrees.add(cle[2]);
    }
  }

  return entrees;
}

/** Clés `_FOO` réellement référencées par un template Cloud Build. */
export function substitutionsReferencees(configSource) {
  return new Set([...configSource.matchAll(/\$\{?(_[A-Z0-9_]+)\}?/g)].map((m) => m[1]));
}

/*
 * Une mention NIÉE n'est pas une prescription.
 *
 * Un runbook honnête doit pouvoir écrire « l'entrée `short_sha` n'existe plus »
 * ou « it does NOT use `cloudbuild.yaml` » sans déclencher le contrôle : c'est
 * précisément la phrase qui protège le lecteur pressé. Sans cette exemption, le
 * seul moyen de faire taire le garde serait de SUPPRIMER l'avertissement —
 * l'inverse du but poursuivi. Mesuré : ma propre correction du 2026-09-06 a été
 * refusée par sa première version.
 *
 * Fenêtre courte (90 caractères) : une négation à l'autre bout du paragraphe ne
 * doit pas blanchir une prescription voisine.
 */
export function estNiee(texte, index) {
  return /\b(NOT|jamais|n'existe plus|n'utilise|does not|never|supprimée?|refusée?)\b/i.test(
    texte.slice(Math.max(0, index - 90), index),
  );
}

export function verifier(lire = (p) => readFileSync(p, 'utf8'), existe = existsSync) {
  const problemes = [];
  let commandesExaminees = 0;
  let affirmationsExaminees = 0;

  for (const document of DOCUMENTS) {
    if (!existe(document)) {
      problemes.push(`${document} : introuvable`);
      continue;
    }

    const source = lire(document);

    // --- règle 1 : les entrées passées à `gh workflow run` doivent exister ----
    for (const commande of commandes(source)) {
      commandesExaminees += 1;

      const workflow = /gh workflow run\s+([\w.-]+\.ya?ml)/.exec(commande);

      if (workflow) {
        const chemin = `.github/workflows/${workflow[1]}`;

        if (!existe(chemin)) {
          problemes.push(`${document} : \`${workflow[1]}\` n'existe pas dans .github/workflows/`);
          continue;
        }

        const declarees = entreesDeclarees(lire(chemin));

        for (const occurrence of commande.matchAll(/-f\s+([A-Za-z_][\w-]*)=/g)) {
          const cle = occurrence[1];

          if (!declarees.has(cle) && !estNiee(commande, occurrence.index ?? 0)) {
            problemes.push(
              `${document} : \`gh workflow run ${workflow[1]} -f ${cle}=…\` — entrée NON déclarée ` +
                `(le workflow accepte : ${[...declarees].join(', ') || 'aucune'}). ` +
                'GitHub refuse avec HTTP 422 Unexpected inputs provided.',
            );
          }
        }
      }

      // --- règle 2 : substitutions Cloud Build non référencées ---------------
      const config = /gcloud builds submit[^\n]*--config=([\w./-]+)/.exec(commande);

      if (config) {
        const chemin = config[1];

        if (!existe(chemin)) {
          problemes.push(`${document} : \`--config=${chemin}\` n'existe pas`);
          continue;
        }

        const referencees = substitutionsReferencees(lire(chemin));
        const passees = /--substitutions=([^\s]+)/.exec(commande);

        for (const paire of (passees?.[1] ?? '').split(',')) {
          const cle = paire.split('=')[0];

          if (!cle.startsWith('_')) {
            continue;
          }

          if (!referencees.has(cle)) {
            problemes.push(
              `${document} : \`--substitutions=…${cle}=…\` sur \`${chemin}\` — clé JAMAIS RÉFÉRENCÉE ` +
                'par ce template. Cloud Build est strict : la soumission échoue avec ' +
                `INVALID_ARGUMENT: key "${cle}" in the substitution data is not matched in the template.`,
            );
          }
        }
      }
    }

    // --- règle 3 : ce que le document AFFIRME de la CD --------------------------
    /*
     * La dérive la plus coûteuse n'était pas une commande fausse, c'était une
     * PHRASE fausse : « la CD appelle `cloudbuild.yaml` ». Elle ne s'exécute pas,
     * donc rien ne la contredit — et on pilote quatre jours dessus.
     */
    const workflowCd = '.github/workflows/deploy-main.yml';

    if (existe(workflowCd)) {
      const reelles = new Set(
        [...lire(workflowCd).matchAll(/--config=([\w./-]+)/g)].map((m) => m[1]),
      );

      /*
       * DÉCOUPAGE PAR PUCE, et non par ligne ni par paragraphe.
       *
       * Par LIGNE : les deux affirmations fausses du 2026-09-06 nommaient le
       * workflow et sa configuration à deux lignes d'écart — zéro affirmation
       * examinée, vert trompeur.
       *
       * Par PARAGRAPHE : la puce « Auto » et la puce « Manuel » se retrouvaient
       * dans le même bloc, et la commande manuelle — qui utilise LÉGITIMEMENT
       * `cloudbuild.yaml` — déclenchait un faux positif. Un garde qui crie à tort
       * finit en exception, et alors il ne protège plus rien.
       *
       * Une puce porte une affirmation, et une seule.
       */
      const segments = source.split(/\r?\n(?=\s*[-*]\s)|\r?\n\s*\r?\n/);

      for (const segment of segments) {
        const decritLaCd =
          segment.includes('deploy-main.yml') ||
          /(\*\*Build:\*\*|\*\*Trigger:\*\*|chaque push sur|every push to)/.test(segment);

        if (!decritLaCd) {
          continue;
        }

        const citations = [
          ...segment.matchAll(/--config=([\w./-]+)/g),
          ...segment.matchAll(/(?<![\w/-])((?:infra\/cloudbuild\/)?[\w-]*cloudbuild[\w-]*\.ya?ml)/g),
        ];

        for (const citation of citations) {
          const citee = citation[1];
          affirmationsExaminees += 1;

          if (reelles.has(citee) || estNiee(segment, citation.index ?? 0)) {
            continue;
          }

          problemes.push(
            `${document} : affirme que la CD construit via \`${citee}\`, ` +
              `alors que \`deploy-main.yml\` utilise ${[...reelles].join(', ')}. ` +
              "Une phrase fausse ne s'exécute jamais, donc rien ne la contredit — " +
              'et on pilote des jours dessus.',
          );
        }
      }
    }
  }

  return { problemes, commandesExaminees, affirmationsExaminees };
}

const estPointDEntree = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());

if (estPointDEntree) {
  const { problemes, commandesExaminees, affirmationsExaminees } = verifier();

  console.log(`  commandes examinées : ${commandesExaminees}`);
  console.log(`  affirmations sur la CD examinées : ${affirmationsExaminees}`);

  /*
   * Un zéro n'est une information que si la recherche a porté sur quelque chose :
   * un parseur cassé rendrait « aucune commande, aucun problème ».
   */
  if (commandesExaminees === 0) {
    console.error('\n  ❌ AUCUNE commande trouvée dans les documents — l’analyse n’a rien mesuré.');
    process.exit(1);
  }

  if (problemes.length === 0) {
    console.log('  ✅ le runbook est exécutable');
  } else {
    console.error(`\n  ❌ ${problemes.length} prescription(s) inexécutable(s) :`);
    problemes.forEach((p) => console.error(`     - ${p}`));
    process.exit(1);
  }
}
