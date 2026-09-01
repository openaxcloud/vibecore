/*
 * BUG-QA-IDENTIFIANTS-BRUTS-UI-001 — un identifiant technique n'est pas un nom.
 *
 * Sept endroits affichaient un cuid de 25 caractères À LA PLACE du nom d'une
 * personne : `cmta9cm7h003t0n8zy8heiw1v` là où l'utilisateur attend quelqu'un.
 * Signalé par Avi sur « Membres actifs », puis retrouvé dans tout le bloc
 * Collaborateurs (présence, ligne collaborateur, auteur de commentaire, acteur
 * d'un événement).
 *
 * Défaut aggravant sur l'avatar : il valait `String(userId).slice(0, 2)`. Or
 * TOUS les cuid commencent par `c` — chaque avatar affichait donc « cm » et
 * tous les participants devenaient visuellement identiques. Ne pas distinguer
 * qui est présent, sur une surface collaborative, est un défaut fonctionnel.
 *
 * ⚠️ CE QUE CE MODULE NE PEUT PAS FAIRE. La fiche d'origine affirme qu'il
 * s'agit « d'un repli non appliqué, pas d'une donnée manquante ». Vérifié :
 * c'est FAUX pour ces surfaces. La charge utile de présence
 * (`upsertCollaborationPresence`) et le type `collaborators`
 * (`{ id?, userId?, roleKey? }`) ne portent NI nom NI courriel. Afficher la
 * vraie identité demande d'enrichir la charge côté serveur — et de décider
 * quelle identité exposer aux collaborateurs, ce qui engage la vie privée.
 *
 * En attendant cette décision, on garantit le strict nécessaire : ne JAMAIS
 * présenter un identifiant technique comme un nom, et rendre les participants
 * DISTINGUABLES. Le module accepte déjà `displayName` pour que le jour où la
 * charge le porte, il n'y ait rien à changer ici.
 */

/** Un cuid ressemble à `c` suivi de 24 caractères alphanumériques. */
const IDENTIFIANT_TECHNIQUE = /^c[a-z0-9]{20,}$/i;

/** Vrai si la valeur est un identifiant technique, donc illisible pour un humain. */
export function estIdentifiantTechnique(valeur: string | undefined | null): boolean {
  return typeof valeur === 'string' && IDENTIFIANT_TECHNIQUE.test(valeur.trim());
}

/**
 * Libellé affichable d'une personne.
 *
 * `repli` est la chaîne DÉJÀ traduite par l'appelant (« Participant 3 »), pour
 * que ce module reste pur et testable sans i18n.
 */
export function libellePersonne(entree: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
  userId?: string | null;
  repli: string;
}): string {
  for (const candidat of [entree.displayName, entree.name, entree.email]) {
    const valeur = candidat?.trim();

    if (valeur && !estIdentifiantTechnique(valeur)) {
      return valeur;
    }
  }

  /*
   * `userId` n'est JAMAIS rendu : c'est tout le défaut. On ne le retient que
   * s'il n'a pas la forme d'un identifiant technique — cas d'une installation
   * qui utiliserait des identifiants lisibles.
   */
  const brut = entree.userId?.trim();

  return brut && !estIdentifiantTechnique(brut) ? brut : entree.repli;
}

/**
 * Initiales d'avatar, dérivées du LIBELLÉ et non de l'identifiant.
 *
 * Prendre les deux premiers caractères d'un cuid rendait « cm » pour tout le
 * monde. On prend l'initiale des deux premiers mots, ou les deux premiers
 * caractères du libellé — ce qui, pour « Participant 3 », donne « P3 » et
 * distingue donc les participants.
 */
export function initialesPersonne(libelle: string): string {
  const mots = libelle
    .trim()
    .split(/\s+/)
    .filter((mot) => mot.length > 0);

  if (mots.length >= 2) {
    return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
  }

  return (mots[0] ?? 'U').slice(0, 2).toUpperCase();
}
