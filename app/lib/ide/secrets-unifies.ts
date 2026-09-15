/*
 * UN PANNEAU, UNE LISTE — MAIS CHAQUE LIGNE GARDE SA NATURE.
 *
 * Avi : « on fusionne `secrets` et `env` en un seul panneau, en gardant le
 * design de Secrets ». La fusion est VISUELLE ; elle ne déplace aucune
 * permission, ni dans un sens ni dans l'autre.
 */

export interface SecretSource {
  key: string;
}

export interface VariableSource {
  key: string;
  value: string;
  scope?: string;
}

export interface LigneUnifiee {
  cle: string;
  nature: 'secret' | 'variable';

  /** Présente UNIQUEMENT pour une variable. Un secret ne la porte jamais ici. */
  valeur?: string;

  /** Vrai quand la valeur exige la barrière de révélation (`security:manage`). */
  masquee: boolean;
  scope?: string;
}

/*
 * L'ÉTAT INTERNE DE LA PLATEFORME N'EST PAS UNE VARIABLE DE L'UTILISATEUR.
 *
 * Dix clés `VIBECORE_*` vivent dans `ProjectEnvVar` — le magasin des variables
 * du projet — et `GET /projects/:id/env-vars` les rend au navigateur SANS
 * FILTRE, sous `projects:read`. C'est déjà un défaut aujourd'hui, avant toute
 * fusion : l'utilisateur les voit, et dans une liste éditable il peut en
 * supprimer une. Chacune sauvegarde l'état d'un panneau (réglages de l'IDE,
 * intégrations, terminal, paquets, débogueur, extensions, ports, sécurité,
 * flux de travail) : la supprimer casse le panneau qu'elle alimente.
 *
 * Le préfixe est le critère, et non une liste figée : une onzième clé ajoutée
 * demain sera masquée sans qu'on ait à y penser.
 */
export const PREFIXE_ETAT_PLATEFORME = 'VIBECORE_';

export function estEtatDePlateforme(cle: string): boolean {
  return cle.startsWith(PREFIXE_ETAT_PLATEFORME);
}

/**
 * Fusionne les deux magasins en UNE liste, chaque ligne gardant sa nature.
 *
 * Un secret n'emporte JAMAIS sa valeur ici : il la garde derrière la barrière
 * de révélation (`security:manage`, par clé). Une variable garde sa valeur
 * lisible, exactement comme avant. Aucune permission ne bouge.
 */
export function fusionner(secrets: readonly SecretSource[], variables: readonly VariableSource[]): LigneUnifiee[] {
  return [
    ...secrets.map((s) => ({
      cle: s.key,
      nature: 'secret' as const,

      /*
       * `valeur` reste ABSENTE — pas vide. Une chaîne vide serait une valeur, et
       * la surface d'affichage ne saurait plus distinguer « masqué » de « vide ».
       */
      masquee: true,
    })),
    ...variables
      .filter((v) => !estEtatDePlateforme(v.key))
      .map((v) => ({
        cle: v.key,
        nature: 'variable' as const,
        valeur: v.value,
        masquee: false,
        scope: v.scope,
      })),
  ];
}
