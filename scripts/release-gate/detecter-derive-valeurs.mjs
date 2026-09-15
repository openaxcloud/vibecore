#!/usr/bin/env node
/**
 * Compare values-prod.yaml aux valeurs réellement stockées par la release Helm,
 * CRIE sur chaque écart, et émet les `--set` qui le referment.
 *
 * Il CRIE, il n'agit pas.
 *
 * Mesuré le 2026-09-04 : sur les 9 écarts de la révision 1127, deux voulaient
 * BAISSER la mémoire du screenshotter (2Gi → 1Gi). Un correctif appliqué
 * autrefois en `--set`, hors du fichier, peut être plus juste que le fichier
 * lui-même : ré-appliquer aveuglément aurait provoqué un OOM. La dérive se
 * signale, elle ne se referme pas toute seule.
 *
 * Ne bloque jamais le déploiement : une dérive de dimensionnement doit être vue
 * et tranchée, pas servir de prétexte à tout arrêter.
 */
import { readFileSync } from 'node:fs';

import { comparerValeurs, formaterEcarts } from './garde-derive-valeurs.mjs';

/*
 * DEUX FICHIERS JSON, aucune dependance externe.
 *
 * La premiere version important `yaml` : sur le runner, ce paquet n'est pas
 * resolvable a ce stade du deploiement, et le controle mourait en
 * ERR_MODULE_NOT_FOUND. Comme il etait lance en `|| true`, il se taisait — un
 * garde contre les reglages silencieux, lui-meme silencieux. La conversion du
 * YAML se fait donc en amont, dans le workflow, et l'echec y est fatal.
 */
const [cheminFichier, cheminRelease] = process.argv.slice(2);

if (!cheminFichier || !cheminRelease) {
  console.error('usage: detecter-derive-valeurs.mjs <valeurs-fichier.json> <valeurs-release.json>');
  process.exit(2);
}

const fichier = JSON.parse(readFileSync(cheminFichier, 'utf8'));
const release = JSON.parse(readFileSync(cheminRelease, 'utf8') || '{}');
const ecarts = comparerValeurs(fichier, release);

console.error(formaterEcarts(ecarts));

const resume = process.env.GITHUB_STEP_SUMMARY;

if (resume) {
  const { appendFileSync } = await import('node:fs');
  const corps =
    ecarts.length === 0
      ? '\n### Dérive des valeurs\n\nAucune : la production applique ce que `values-prod.yaml` demande.\n'
      : [
          '\n### ⚠️ Dérive des valeurs de production',
          '',
          '| service | réglage | le fichier demande | la production applique |',
          '|---|---|---|---|',
          ...ecarts.map((e) => `| ${e.service} | \`${e.chemin}\` | \`${e.demande}\` | \`${e.applique}\` |`),
          '',
          '`--reuse-values` ne relit pas le fichier : ces écarts ne se refermeront pas seuls.',
          'Trancher chaque ligne — le fichier n\'a pas toujours raison contre la production.',
          '',
        ].join('\n');
  appendFileSync(resume, corps);
}

for (const ecart of ecarts) {
  console.error(
    `::error title=Dérive des valeurs::${ecart.service}.${ecart.chemin} — le fichier demande ${ecart.demande}, la production applique ${ecart.applique}`,
  );
}
