/*
 * BUG-IDE-STATE-007 — ce que le NAVIGATEUR reçoit de `ide-state`.
 *
 * `ide-state` rend deux services à deux consommateurs différents :
 *
 *   - un ÉTAT D'INTERFACE (`ui`, `chat`) — quelques octets, lu par le navigateur ;
 *   - un MAGASIN DE CONTENU DE FICHIERS (`files.entries`) — plusieurs mégaoctets,
 *     lu par le SERVEUR (`listProjectFilesIncludingIdeState`, appelée depuis plus
 *     de dix endroits : statut et commit git, exports, déploiements).
 *
 * Anatomie mesurée en production le 2026-09-04, projet de 401 fichiers, AVANT
 * toute ouverture de l'IDE :
 *
 *     ui              2 o        ({})
 *     chat           15 o        ({"messages":[]})
 *     files.entries   4 101 427 o   (401 entrées, 3,72 Mio de contenu brut)
 *
 * L'état réel pèse 17 octets ; le reste est une TROISIÈME copie des fichiers
 * (déjà présents dans le stockage projet et dans le pod). Le budget client a été
 * dimensionné pour le petit métier — plafond par entrée 512 Kio, délai de
 * chargement 5 s — et la charge utile est faite à 100 % du gros. Résultat
 * mesuré : `skipped-too-large` 3 fois sur 3, l'état n'est JAMAIS écrit
 * localement, et le chargement réseau expire 2 fois sur 3.
 *
 * Or le client n'en fait rien : son type `ProjectIdeMemory` déclare
 * `chat`, `ui`, `updatedAt` — et AUCUN champ `files`. Aucune lecture de
 * `state.files` côté client. Il téléchargeait donc jusqu'à 38,7 Mio par
 * ouverture à froid d'une charge qu'il ne sait pas décrire et ne lit jamais.
 *
 * On PROJETTE donc la lecture destinée au navigateur. On ne supprime rien du
 * magasin : le serveur en dépend.
 *
 * ── Pourquoi c'est sûr sur le chemin d'écriture ──────────────────────────────
 * Le client renvoie `{ ...état reçu }` dans son `PUT`. En ne recevant plus
 * `files`, il ne le renvoie plus : `incoming.files` devient `undefined`, et
 * `mergeProjectIdeState` (services/api/src/app.ts) conserve alors l'existant —
 * c'est la branche `gardeExistant`. Cette projection SUPPRIME même la cause de
 * BUG-CREATE-010, où la photo du manifeste prise à l'ouverture était renvoyée
 * telle quelle et écrasait une version plus fraîche.
 *
 * ⚠️ Cette sûreté DÉPEND de cette branche du serveur. `ide-state-browser-projection.spec.ts`
 * la vérifie explicitement : si quelqu'un « simplifie » la fusion, le test tombe
 * AVANT que `git status` ne se remette à annoncer « 0 changement » pour toujours.
 *
 * N'est PAS appliquée au `PUT` : des chemins légitimes y posent `files`
 * (récupération d'échafaudage, indexation des manifestes de paquets).
 */

/** Clés retirées de la réponse envoyée au navigateur. */
export const IDE_STATE_SERVER_ONLY_KEYS = ['files'] as const;

function estObjet(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Rend une COPIE de l'enveloppe `ide-state` sans les clés réservées au serveur.
 *
 * Ne mute jamais son entrée : l'objet d'origine reste intact pour tout appelant
 * serveur qui le partagerait.
 */
export function projectIdeStateForBrowser<T>(payload: T): T {
  if (!estObjet(payload)) {
    return payload;
  }

  const enveloppe = payload as Record<string, unknown>;
  const ideState = enveloppe.ideState;

  if (!estObjet(ideState)) {
    return payload;
  }

  const state = ideState.state;

  if (!estObjet(state)) {
    return payload;
  }

  const projete: Record<string, unknown> = { ...state };
  let retire = false;

  for (const key of IDE_STATE_SERVER_ONLY_KEYS) {
    if (key in projete) {
      delete projete[key];
      retire = true;
    }
  }

  if (!retire) {
    return payload;
  }

  return { ...enveloppe, ideState: { ...ideState, state: projete } } as T;
}
