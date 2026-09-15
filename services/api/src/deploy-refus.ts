/*
 * BUG-DEPLOY-STATIC-FAIL-001 — dire POURQUOI un déploiement n'a pas démarré,
 * sans jamais dire ce qu'il ne faut pas dire.
 *
 * Avi, 09/09 : « impossible de déployer en réel, aucun fournisseur ne
 * fonctionne », sur une carte qui affichait « Échec » et rien d'autre. Les
 * points d'abandon du build en pod avalaient l'erreur dans un `catch {}` nu —
 * exactement ce qu'interdit la règle 13 : masquer la sortie d'erreur de la
 * commande dont on lit le résultat transforme un échec en silence, et un
 * silence se lit comme « on ne sait pas ».
 *
 * Mais une erreur d'infrastructure porte souvent une URL, et une URL porte
 * parfois un jeton. La règle 12 est claire : jamais la VALEUR d'un secret. Ce
 * module rend donc une phrase COURTE et LAVÉE — assez pour diagnostiquer,
 * jamais assez pour fuir.
 */

const LONGUEUR_MAX = 240;

/*
 * Ce qu'on efface, et pourquoi chaque motif est là :
 *   - la chaîne de requête d'une URL : c'est là que voyagent `?token=`,
 *     `?sig=`, `?access_token=` ;
 *   - `Bearer <…>` et les en-têtes d'autorisation ;
 *   - toute suite d'au moins 24 caractères de l'alphabet des jetons — un
 *     secret n'a pas besoin d'être annoncé pour en être un.
 *
 * On préfère effacer trop que pas assez : ce qui reste doit suffire à nommer le
 * point d'abandon, pas à rejouer l'appel.
 */
const LAVAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\?[^\s"']*/g, '?<élidé>'],
  [/\b[Bb]earer\s+\S+/g, 'Bearer <élidé>'],
  [/\b[A-Za-z0-9_-]{24,}\b/g, '<élidé>'],
];

export function laverDetailDeRefus(texte: string): string {
  let lave = texte;

  for (const [motif, remplacement] of LAVAGES) {
    lave = lave.replace(motif, remplacement);
  }

  lave = lave.replace(/\s+/g, ' ').trim();

  return lave.length > LONGUEUR_MAX ? `${lave.slice(0, LONGUEUR_MAX)}…` : lave;
}

/**
 * Une phrase courte décrivant une erreur attrapée, sûre à écrire dans le
 * journal d'un déploiement. Rend `''` quand il n'y a rien à dire — un appelant
 * n'ajoute alors pas de parenthèse vide.
 */
export function refusalDetail(erreur: unknown): string {
  if (erreur === null || erreur === undefined) {
    return '';
  }

  if (typeof erreur === 'string') {
    return laverDetailDeRefus(erreur);
  }

  if (erreur instanceof Error) {
    const code = (erreur as { code?: unknown }).code;
    const statut = (erreur as { statusCode?: unknown }).statusCode;

    const morceaux = [
      typeof code === 'string' || typeof code === 'number' ? String(code) : '',
      typeof statut === 'number' ? `HTTP ${statut}` : '',
      erreur.message,
    ].filter((morceau) => morceau !== '');

    return laverDetailDeRefus(morceaux.join(' — '));
  }

  if (typeof erreur === 'object') {
    const message = (erreur as { message?: unknown }).message;

    if (typeof message === 'string') {
      return laverDetailDeRefus(message);
    }
  }

  return laverDetailDeRefus(String(erreur));
}
