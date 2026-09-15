/*
 * Onglet Secrets — la logique pure, hors React (RP-SEC-01 à 08).
 *
 * Référence : l'onglet Secrets de Replit sur iPhone (captures d'Avi du 07/09,
 * 14:19–14:20). Tout ce qui se décide sans le DOM vit ici, sous test : le
 * filtre, la validité d'une clé, le texte d'un éditeur .env / JSON et sa
 * relecture, la position d'un menu flottant sous son bouton.
 */

export interface SecretListe {
  key: string;
  updatedAt?: string | null;
}

export interface EntreeSecret {
  key: string;
  value: string;
}

const CLE_VALIDE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/*
 * Le filtre de Replit : « Filter Secrets by name », sans casse, sur une
 * sous-chaîne — et la liste est triée par nom, comme la sienne. L'API rend
 * les secrets dans l'ordre de leur dernière écriture (mesuré : ADMIN, API,
 * BACKUP, ALLOWED, APP…), ce qui déplace une ligne à chaque modification.
 */
export function filtrerLesSecrets<T extends SecretListe>(secrets: readonly T[], filtre: string): T[] {
  const aiguille = filtre.trim().toLowerCase();
  const tries = [...secrets].sort((a, b) => a.key.localeCompare(b.key, 'en', { sensitivity: 'base' }));

  if (!aiguille) {
    return tries;
  }

  return tries.filter((secret) => secret.key.toLowerCase().includes(aiguille));
}

export function cleValide(cle: string): boolean {
  return CLE_VALIDE.test(cle.trim());
}

/* « Ajouter le secret » ne s'active qu'avec une clé valide ET une valeur. */
export function peutAjouter(cle: string, valeur: string): boolean {
  return cleValide(cle) && valeur.length > 0;
}

/*
 * L'éditeur « Modifier en .env » part des clés existantes, valeurs vides : on
 * n'affiche jamais une valeur sans un geste de révélation explicite. Une ligne
 * laissée vide ne touche à rien ; une ligne remplie met le secret à jour.
 */
export function texteEnvDepuisCles(cles: readonly string[]): string {
  return cles.map((cle) => `${cle}=`).join('\n');
}

export function texteJsonDepuisCles(cles: readonly string[]): string {
  return JSON.stringify(Object.fromEntries(cles.map((cle) => [cle, ''])), null, 2);
}

export interface LectureJson {
  entries: EntreeSecret[];
  erreur: 'json-invalide' | 'pas-un-objet' | 'valeur-non-textuelle' | null;
  clesInvalides: string[];
}

/* Relit l'éditeur JSON : un objet plat de chaînes ; les valeurs vides sont ignorées. */
export function entreesDepuisJson(texte: string): LectureJson {
  let brut: unknown;

  try {
    brut = JSON.parse(texte);
  } catch {
    return { entries: [], erreur: 'json-invalide', clesInvalides: [] };
  }

  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    return { entries: [], erreur: 'pas-un-objet', clesInvalides: [] };
  }

  const entries: EntreeSecret[] = [];
  const clesInvalides: string[] = [];

  for (const [cle, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (typeof valeur !== 'string') {
      return { entries: [], erreur: 'valeur-non-textuelle', clesInvalides: [] };
    }

    if (!cleValide(cle)) {
      clesInvalides.push(cle);
      continue;
    }

    if (valeur.length > 0) {
      entries.push({ key: cle.trim(), value: valeur });
    }
  }

  return { entries, erreur: null, clesInvalides };
}

/* Les lignes d'un .env dont la valeur est restée vide ne sont pas des mises à jour. */
export function garderLesValeursRenseignees(entries: readonly EntreeSecret[]): EntreeSecret[] {
  return entries.filter((entry) => entry.value.length > 0);
}

/*
 * Un menu flottant s'ouvre SOUS son bouton, aligné à droite comme celui de
 * Replit ; s'il déborderait en bas, il s'ouvre au-dessus. Il ne sort jamais
 * de l'écran, marge comprise.
 */
export function placerSousLeBouton(
  bouton: { left: number; right: number; top: number; bottom: number },
  menu: { largeur: number; hauteur: number },
  ecran: { largeur: number; hauteur: number },
  marge = 8,
): { x: number; y: number } {
  const xDroite = bouton.right - menu.largeur;
  const x = Math.min(Math.max(marge, xDroite), Math.max(marge, ecran.largeur - menu.largeur - marge));
  const dessous = bouton.bottom + 4;
  const debordeEnBas = dessous + menu.hauteur + marge > ecran.hauteur;
  const y = debordeEnBas ? Math.max(marge, bouton.top - 4 - menu.hauteur) : dessous;

  return { x: Math.round(x), y: Math.round(y) };
}
