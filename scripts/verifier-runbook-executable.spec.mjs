import { describe, expect, it } from 'vitest';

import { commandes, entreesDeclarees, estNiee, substitutionsReferencees, verifier } from './verifier-runbook-executable.mjs';

/**
 * LES QUATRE DÉRIVES DU 2026-09-06, REJOUÉES.
 *
 * Ce ne sont pas des cas inventés : chacun est un texte qui a réellement vécu
 * dans `CLAUDE.md` ou `docs/DEPLOY_RUNBOOK.md`, et chacun a coûté quelque chose —
 * une commande refusée, un déploiement impossible, ou quatre jours de pilotage
 * sur une description fausse.
 *
 * Un contrôle qui n'en attraperait que trois serait incomplet, et on le saurait
 * ici plutôt qu'au mauvais moment.
 */

const WORKFLOW_CD = `
name: Deploy Production
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      target_sha:
        description: Full 40-hex commit sha
        required: false
      force_tiers:
        description: web/runtime/wsagent
        required: false
jobs:
  build:
    steps:
      - run: gcloud builds submit --config=infra/cloudbuild/runtime-tier.yaml .
      - run: gcloud builds submit --config=infra/cloudbuild/single-web.yaml .
      - run: gcloud builds submit --config=infra/cloudbuild/workspace-agent.yaml .
`;

/* Le vrai `cloudbuild.yaml` ne référence que ces quatre substitutions. */
const CLOUDBUILD = `
steps:
  - id: build-web
    args: ['build', '--tag=\${_REGION}-docker.pkg.dev/\${_PROJECT}/\${_REPO}/web:\${_SHORT_SHA}', '.']
substitutions:
  _REGION: europe-west9
  _PROJECT: vibecore-495216
  _REPO: vibecore-prod-containers
  _SHORT_SHA: dev
`;

const FICHIERS = {
  '.github/workflows/deploy-main.yml': WORKFLOW_CD,
  'cloudbuild.yaml': CLOUDBUILD,
  'infra/cloudbuild/single-web.yaml': 'steps: []\n',
};

function faireTourner(documents) {
  const tout = { ...FICHIERS, ...documents };

  return verifier(
    (chemin) => {
      if (!(chemin in tout)) {
        throw new Error(`fichier absent du double : ${chemin}`);
      }

      return tout[chemin];
    },
    (chemin) => chemin in tout,
  );
}

const SAIN_CLAUDE = `
- **Auto** : chaque push sur \`main\` déclenche \`.github/workflows/deploy-main.yml\`, qui build via
  \`infra/cloudbuild/runtime-tier.yaml\`, \`infra/cloudbuild/single-web.yaml\` et
  \`infra/cloudbuild/workspace-agent.yaml\`.
- **Manuel** : \`gh workflow run deploy-main.yml -R openaxcloud/vibecore -f target_sha=<40 hex>\`.
`;

const SAIN_RUNBOOK = `
- **Trigger:** every push to \`main\` runs \`.github/workflows/deploy-main.yml\`.
- **Build:** it calls \`infra/cloudbuild/single-web.yaml\`. It does NOT use root \`cloudbuild.yaml\`.
`;

describe('le runbook reste exécutable', () => {
  it('VERT : des documents à jour ne produisent aucun problème', () => {
    const r = faireTourner({ 'CLAUDE.md': SAIN_CLAUDE, 'docs/DEPLOY_RUNBOOK.md': SAIN_RUNBOOK });

    expect(r.problemes).toEqual([]);
    /* Le vert ne vaut que si l'analyse a porté sur quelque chose. */
    expect(r.commandesExaminees).toBeGreaterThan(0);
    expect(r.affirmationsExaminees).toBeGreaterThan(0);
  });

  it('DÉRIVE 1 — la CD décrite comme appelant `cloudbuild.yaml` (4 jours de pilotage faux)', () => {
    const r = faireTourner({
      'CLAUDE.md': `
- **Auto** : chaque push sur \`main\` déclenche \`.github/workflows/deploy-main.yml\`. Il build via
  \`gcloud builds submit --config=cloudbuild.yaml --region=europe-west9\` (7 images).
`,
      'docs/DEPLOY_RUNBOOK.md': SAIN_RUNBOOK,
    });

    expect(r.problemes.join(' ')).toContain('affirme que la CD construit via');
    expect(r.problemes.join(' ')).toContain('cloudbuild.yaml');
  });

  it('DÉRIVE 1 bis — la même affirmation dans le runbook, sans `deploy-main.yml` sur la puce', () => {
    const r = faireTourner({
      'CLAUDE.md': SAIN_CLAUDE,
      'docs/DEPLOY_RUNBOOK.md': `
- **Trigger:** every push to \`main\` runs the deploy workflow.
- **Build:** it calls \`gcloud builds submit --config=cloudbuild.yaml\`, producing 7 images.
`,
    });

    expect(r.problemes.join(' ')).toContain('affirme que la CD construit via');
  });

  it('DÉRIVE 2 — substitutions non référencées par le template (INVALID_ARGUMENT)', () => {
    const r = faireTourner({
      'CLAUDE.md': SAIN_CLAUDE,
      'docs/DEPLOY_RUNBOOK.md': `
${SAIN_RUNBOOK}
\`\`\`bash
gcloud builds submit --config=cloudbuild.yaml \\
  --substitutions=_SHORT_SHA="\${SHORT_SHA}",_VITE_RUNTIME_MODE=remote-kubernetes
\`\`\`
`,
    });

    const texte = r.problemes.join(' ');
    expect(texte).toContain('_VITE_RUNTIME_MODE');
    expect(texte).toContain('JAMAIS RÉFÉRENCÉE');
  });

  it('DÉRIVE 3 — `_DEPS_TAG`, même cause, clé distincte', () => {
    const r = faireTourner({
      'CLAUDE.md': SAIN_CLAUDE,
      'docs/DEPLOY_RUNBOOK.md': `
${SAIN_RUNBOOK}
\`\`\`bash
gcloud builds submit --config=cloudbuild.yaml --substitutions=_SHORT_SHA=abc,_DEPS_TAG=abc
\`\`\`
`,
    });

    expect(r.problemes.join(' ')).toContain('_DEPS_TAG');
  });

  it('DÉRIVE 4 — `-f short_sha=` sur une entrée supprimée (HTTP 422)', () => {
    const r = faireTourner({
      'CLAUDE.md': `
- **Manuel** : \`gh workflow run deploy-main.yml -R openaxcloud/vibecore -f short_sha=<sha>\`.
`,
      'docs/DEPLOY_RUNBOOK.md': SAIN_RUNBOOK,
    });

    const texte = r.problemes.join(' ');
    expect(texte).toContain('short_sha');
    expect(texte).toContain('NON déclarée');
    /* Le message doit dire ce qui EST accepté, sinon il ne répare rien. */
    expect(texte).toContain('target_sha');
  });

  it('un fichier de configuration cité mais inexistant est signalé', () => {
    const r = faireTourner({
      'CLAUDE.md': `${SAIN_CLAUDE}\n\`gcloud builds submit --config=infra/cloudbuild/disparu.yaml\`\n`,
      'docs/DEPLOY_RUNBOOK.md': SAIN_RUNBOOK,
    });

    expect(r.problemes.join(' ')).toContain("n'existe pas");
  });

  it('PAS DE FAUX POSITIF : la commande MANUELLE peut légitimement citer `cloudbuild.yaml`', () => {
    /*
     * C'est le cas qui a failli rendre ce garde inutilisable : la puce « Auto »
     * et la puce « Manuel » se suivent, et la seconde utilise `cloudbuild.yaml`
     * à bon droit. Un garde qui crie ici serait mis en exception, donc désarmé.
     */
    const r = faireTourner({
      'CLAUDE.md': `${SAIN_CLAUDE}
- **Manuel** : \`gcloud builds submit --config=cloudbuild.yaml --substitutions=_SHORT_SHA=abc\`.
`,
      'docs/DEPLOY_RUNBOOK.md': SAIN_RUNBOOK,
    });

    expect(r.problemes).toEqual([]);
  });

  it('les briques d’analyse tiennent seules', () => {
    expect([...entreesDeclarees(WORKFLOW_CD)]).toEqual(['target_sha', 'force_tiers']);
    expect(substitutionsReferencees(CLOUDBUILD).has('_SHORT_SHA')).toBe(true);
    expect(substitutionsReferencees(CLOUDBUILD).has('_DEPS_TAG')).toBe(false);
    expect(commandes('`gh workflow run a.yml \\\n  -f x=1`').length).toBe(1);
  });

  it('un AVERTISSEMENT sur une entrée supprimée doit passer, pas être puni', () => {
    /*
     * Sans cette exemption, le seul moyen de faire taire le garde serait de
     * SUPPRIMER l'avertissement qui protège le lecteur pressé — l'inverse du but.
     * Ma propre correction du 2026-09-06 a été refusée par la première version.
     */
    const r = faireTourner({
      /*
       * La commande ET son avertissement dans la MÊME puce, comme dans le
       * document réel : c'est la seule forme que le contrôle examine, puisqu'il
       * ne regarde que les lignes portant une commande. Une première version de
       * ce cas plaçait l'avertissement sur une ligne isolée — jamais examinée,
       * donc verte quoi qu'il arrive. La contre-épreuve l'a montré : neutraliser
       * l'exemption ne la faisait pas rougir.
       */
      'CLAUDE.md': `${SAIN_CLAUDE}
- **Manuel** : \`gh workflow run deploy-main.yml -f target_sha=<40 hex>\` ⚠️ l'entrée \`short_sha\` n'existe plus, un \`-f short_sha=<sha>\` est refusé par HTTP 422.
`,
      'docs/DEPLOY_RUNBOOK.md': SAIN_RUNBOOK,
    });

    expect(r.problemes).toEqual([]);
  });

  it('mais la même entrée PRESCRITE reste refusée — l’exemption ne blanchit pas tout', () => {
    const r = faireTourner({
      'CLAUDE.md': `
- **Manuel** : lancer \`gh workflow run deploy-main.yml -f short_sha=<sha>\` pour forcer un déploiement.
`,
      'docs/DEPLOY_RUNBOOK.md': SAIN_RUNBOOK,
    });

    expect(r.problemes.join(' ')).toContain('short_sha');
  });

  it('la négation ne porte que sur une fenêtre courte', () => {
    /*
     * Le cas NÉGATIF doit contenir une vraie négation, placée HORS de portée —
     * sinon il rend `false` par absence de négation et non par distance, et il
     * reste vert même si la fenêtre disparaît. Vérifié : la première version de
     * ce cas ne rougissait pas quand on rendait la fenêtre illimitée.
     */
    const proche = "il n'existe plus, donc -f short_sha";
    expect(estNiee(proche, proche.indexOf('-f'))).toBe(true);

    const lointain = `il n'existe plus ${'x'.repeat(200)} -f short_sha`;
    expect(estNiee(lointain, lointain.indexOf('-f'))).toBe(false);
  });
});
