/**
 * Garde contre la DÉRIVE SILENCIEUSE des valeurs de dimensionnement.
 *
 * Le déploiement continu appelle `helm upgrade --reuse-values` : il ne relit
 * JAMAIS `values-prod.yaml`. Un réglage fusionné dans le fichier peut donc
 * n'atteindre jamais la production — sans erreur, sans alerte, sans trace.
 *
 * Mesuré : #375 relevait la limite processeur de l'api de 500m à 2. Fusionnée
 * le 2026-09-02, elle est restée lettre morte jusqu'au 2026-09-04 — deux jours
 * pendant lesquels 12,6 % des périodes processeur étaient étranglées, et rien
 * ne l'a dit.
 *
 * Ce garde compare, à chaque déploiement, ce que le FICHIER demande et ce que
 * la RELEASE applique réellement, et il CRIE quand les deux divergent.
 */

/** Champs comparés : ceux qui changent le comportement en production. */
const CHAMPS = ['resources', 'replicas', 'maxReplicas'];

const aplatir = (valeur, prefixe = '') =>
  valeur && typeof valeur === 'object' && !Array.isArray(valeur)
    ? Object.entries(valeur).flatMap(([k, v]) => aplatir(v, prefixe ? `${prefixe}.${k}` : k))
    : [[prefixe, String(valeur)]];

/**
 * `--set services.api.resources.limits.cpu=2` stocke le nombre 2 ; le fichier
 * YAML porte la chaîne '2'. Ce sont les MÊMES 2 cœurs. Comparer les formes
 * rendrait le garde bruyant, donc inutile, donc désactivé — puis absent.
 */
const memeQuantite = (a, b) => {
  if (a === b) return true;
  const n = (v) => (/^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
  return n(a) !== null && n(a) === n(b);
};

export function comparerValeurs(fichier, release) {
  const ecarts = [];
  const services = fichier?.services ?? {};

  for (const [service, config] of Object.entries(services)) {
    if (config?.enabled === false) continue;

    for (const champ of CHAMPS) {
      if (config?.[champ] === undefined) continue;

      const attendus = aplatir(config[champ], champ);
      const applique = release?.services?.[service]?.[champ];

      if (applique === undefined) {
        ecarts.push({
          service,
          chemin: champ,
          demande: JSON.stringify(config[champ]),
          applique: 'ABSENT des valeurs de la release',
        });
        continue;
      }

      const reels = new Map(aplatir(applique, champ));

      for (const [chemin, demande] of attendus) {
        const valeur = reels.get(chemin);

        if (valeur === undefined || !memeQuantite(demande, valeur)) {
          ecarts.push({ service, chemin, demande, applique: valeur ?? 'ABSENT' });
        }
      }
    }
  }

  return ecarts;
}

export function formaterEcarts(ecarts) {
  if (ecarts.length === 0) {
    return 'Aucune dérive : la production applique ce que values-prod.yaml demande.';
  }

  const lignes = ecarts.map(
    (e) => `  ${e.service}.${e.chemin} — le fichier demande ${e.demande}, la production applique ${e.applique}`,
  );

  return [
    `DÉRIVE DES VALEURS : ${ecarts.length} écart(s) entre values-prod.yaml et la release en cours.`,
    ...lignes,
    '',
    'Le déploiement continu utilise --reuse-values : il ne relit pas le fichier.',
    'Re-appliquer explicitement, par exemple :',
    ...ecarts.map((e) => `  --set services.${e.service}.${e.chemin}=${e.demande}`),
  ].join('\n');
}
