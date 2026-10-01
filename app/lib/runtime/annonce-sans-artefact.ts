/*
 * UNE ANNONCE N'EST PAS UNE LIVRAISON.
 *
 * Mesuré le 2026-09-10 sur les trois applications vides du 09-09 (14:27, 14:29,
 * 14:33). Leurs transcrits ne sont PAS tronqués : ils se terminent sur une
 * phrase complète, et cette phrase ANNONCE l'artefact qui ne viendra jamais.
 *
 *   « Prêt à générer l'artefact ! »
 *   « Je passe maintenant à la phase d'implémentation complète. »
 *   « Voici la base du projet parfaitement intégrée, prête pour développement. »
 *
 * 4 174, 4 379 et 4 587 caractères, zéro `<boltAction type="file">`, aucune
 * balise `</boltArtifact>`. Le tour s'est terminé sur `finishReason: 'stop'`
 * entre le préambule et l'implémentation.
 *
 * ET LA CONTINUATION NE LE RATTRAPE PAS : elle ne se déclenche que sur
 * `finishReason === 'length'`. Un tour qui s'arrête de lui-même après avoir
 * annoncé son artefact est donc compté comme une RÉUSSITE. Le serveur le
 * remarque — `warnIfNoFilesGenerated` écrit une annotation — mais il n'en tire
 * aucune conséquence, et son commentaire accuse le modèle (« model likely too
 * weak »).
 *
 * CETTE ACCUSATION EST FAUSSE, ET C'EST MESURÉ. Le même `gpt-4.1`, appelé depuis
 * le même pod de production avec la même consigne système (`getFineTunedPrompt`,
 * 27 076 caractères) et une consigne de construction de 817 caractères, écrit
 * 20 fichiers. Passé par la plateforme, il en écrit 15. Le modèle sait faire ;
 * ce qui manque, c'est de lui redonner la main quand il s'arrête trop tôt.
 *
 * Épinglé par `app/lib/runtime/annonce-sans-artefact.spec.ts` — une preuve live vaut pour le jour
 * où elle a été prise ; un test vaut pour tous les jours suivants.
 */

/*
 * ⚠️ UNE RELANCE NUE NE SUFFIT PAS — MESURÉ, PAS SUPPOSÉ.
 *
 * Rejoué le 2026-09-10 sur le PRÉAMBULE RÉEL du cas fautif (4 174 caractères,
 * relu en base), avec la consigne d'Avi (6 230 caractères) et la consigne
 * système de production, appelé depuis le pod de production :
 *
 *   relance nue (`CONTINUE_PROMPT`) ....... 2 870 car., ZÉRO fichier, pas
 *                                           d'artefact — le modèle réécrit un
 *                                           préambule (« Je poursuis la
 *                                           génération… ») et s'arrête ENCORE ;
 *   relance explicite (ci-dessous) ........ 27 921 car., 13 fichiers, artefact.
 *
 * « Continue where you left off » ne dit pas au modèle que ce qu'il a laissé
 * était une ANNONCE : il annonce donc de nouveau. Brancher la continuation
 * existante sur ce cas aurait été le correctif qui a l'air juste et ne change
 * rien — un second tour facturé pour un second préambule.
 */
export const RELANCE_ARTEFACT_MANQUANT = [
  "Tu as annoncé l'artefact sans l'écrire. Passe MAINTENANT à l'implémentation :",
  'émets le <boltArtifact> avec toutes les actions <boltAction type="file"> nécessaires',
  "au démarrage de l'application. Aucun préambule, aucune explication — l'artefact seul.",
].join(' ');

/*
 * L'UTILISATEUR A DIT NON. Mesuré le 2026-09-28 en production, sur un vrai tour
 * `claude-opus-5` (projet `cmukvgycf00cp0nf94j2l71js`) : la consigne était « n'écris
 * AUCUN fichier et ne produis aucun artefact : présente uniquement ton plan […]
 * puis arrête-toi et attends ma validation ». Le modèle a obéi — « Aucun fichier
 * n'est écrit à ce stade — j'attends ta validation » — et la relance ci-dessus l'a
 * contredit : le segment suivant a écrit ONZE fichiers.
 *
 * Un tour sans fichier est ici la bonne réponse, exactement comme en mode
 * discussion. La relance est un filet contre un modèle qui s'arrête trop tôt ;
 * elle ne doit jamais passer par-dessus une décision de l'utilisateur.
 *
 * La détection est volontairement ÉTROITE : elle exige un refus explicite
 * (négation + écriture de fichiers/code, « plan seulement », « attends ma
 * validation »). Un faux négatif rend le comportement d'avant — la relance —,
 * un faux positif rend un tour sans fichier que l'utilisateur voit et peut
 * relancer lui-même. Épinglé par `annonce-sans-artefact.spec.ts`.
 */
const REFUS_DE_FICHIERS: readonly RegExp[] = [
  // « n'écris aucun fichier », « ne crée pas de fichiers », « ne génère aucun code »
  /\bn(?:e |')\s*(?:(?:l|les)\s+)?(?:ecri|cree|genere|produi|touche|modifie|code|lance|commence)\w*\s+(?:encore\s+|rien\s+|aucun\w*\s+|pas\s+(?:de\s+|d'|encore\s+)?(?:(?:un|une|les|le|la)\s+)?)[^.!?\n]{0,30}?\b(?:fichiers?|code|artefacts?|implementation|modifications?)\b/,

  // « sans écrire de fichier », « sans toucher au code »
  /\bsans\s+(?:rien\s+)?(?:ecrire|creer|generer|produire|toucher|modifier)\b[^.!?\n]{0,20}?\b(?:fichiers?|code|artefacts?)\b/,

  // « aucun fichier », « aucun artefact » posés comme consigne
  /\b(?:aucun|aucune|zero|pas\s+de|pas\s+d')\s+(?:fichiers?|artefacts?|code)\b/,

  // « uniquement ton plan », « plan seulement », « juste le plan »
  /\b(?:uniquement|seulement|juste)\s+(?:ton|le|un|votre|mon)\s+plan\b/,
  /\bplan\s+(?:seulement|uniquement)\b/,

  // « attends ma validation », « attendez mon feu vert »
  /\batten[dt]\w*\s+(?:ma|mon|notre|la|le)\s+(?:validation|feu vert|accord|confirmation|go)\b/,

  // anglais
  /\b(?:do not|don't|dont|never)\s+(?:write|create|generate|produce|touch|modify|change|edit)\b[^.!?\n]{0,30}?\b(?:files?|code|artifacts?)\b/,
  /\bwithout\s+(?:writing|creating|generating|touching|changing)\b[^.!?\n]{0,20}?\b(?:files?|code)\b/,
  /\bno\s+(?:files?|code|artifacts?)\s+(?:yet|for now|now|please)\b/,
  /\b(?:plan only|only (?:the|a|your) plan|just (?:the|a|your) plan)\b/,
  /\bwait (?:for )?my (?:approval|confirmation|go-ahead|validation|ok)\b/,
];

/*
 * UNE RESTRICTION DE PORTÉE N'EST PAS UN REFUS. « Ne modifie rien d'autre »,
 * « aucun autre fichier », « don't touch any other files » disent OÙ écrire,
 * pas de ne rien écrire. Mesuré en production le 2026-10-01 à 16:44 : « Ajoute
 * […] une ligne à src/App.tsx. Ne modifie rien d'autre, aucun autre fichier. »
 * était classé refus, et la barrière jetait l'écriture de l'agent en silence.
 * Un passage qui porte l'un de ces mots ne compte pas comme refus ; chaque
 * passage est examiné, si bien qu'un vrai refus ailleurs dans le message reste
 * reconnu.
 */
const RESTRICTION_DE_PORTEE = /\b(?:autres?|other|others|else)\b|\bd'autres?\b/;

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u02bc`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Vrai quand le message de l'utilisateur REFUSE explicitement l'écriture de fichiers. */
export function refusExpliciteDeFichiers(texte: string | undefined | null): boolean {
  if (!texte) {
    return false;
  }

  const t = normaliser(texte);

  return REFUS_DE_FICHIERS.some((motif) =>
    [...t.matchAll(new RegExp(motif.source, 'g'))].some((passage) => !RESTRICTION_DE_PORTEE.test(passage[0])),
  );
}

export type FinDeTour = Readonly<{
  /** Raison de fin rendue par le fournisseur. */
  finishReason: string;

  /** Le tour DEMANDAIT des fichiers. */
  modeConstruction: boolean;

  /** L'utilisateur a explicitement REFUSÉ l'écriture de fichiers pour ce tour. */
  fichiersRefuses: boolean;

  /** Au moins une action de fichier a été émise pendant le tour. */
  fichierEmis: boolean;

  /** Continuations déjà consommées par ce tour. */
  segmentsConsommes: number;

  /** Plafond dur, partagé avec la continuation `length`. */
  segmentsMax: number;
}>;

export type SuiteDuTour =
  | Readonly<{ action: 'terminer' }>
  | Readonly<{ action: 'continuer'; cause: 'longueur' | 'annonce-sans-artefact'; relance: string }>
  | Readonly<{ action: 'terminer-en-echec'; cause: 'annonce-sans-artefact-plafond' }>;

/**
 * Décide de la suite d'un tour.
 *
 * Deux causes de continuation, et elles ne se confondent pas :
 *  - `longueur` : le fournisseur a été coupé net, comportement déjà géré ;
 *  - `annonce-sans-artefact` : il s'est arrêté DE LUI-MÊME sans livrer.
 *
 * Au plafond, on termine EN ÉCHEC plutôt qu'en silence : une application vide
 * présentée comme une réussite est précisément le défaut à supprimer.
 */
export function suiteDuTour(fin: FinDeTour, relanceLongueur: string): SuiteDuTour {
  if (fin.finishReason === 'length') {
    return fin.segmentsConsommes >= fin.segmentsMax
      ? { action: 'terminer' }
      : { action: 'continuer', cause: 'longueur', relance: relanceLongueur };
  }

  if (!fin.modeConstruction || fin.fichierEmis || fin.fichiersRefuses) {
    return { action: 'terminer' };
  }

  /*
   * `stop` en mode construction sans un seul fichier. On redonne la main —
   * c'est exactement ce que l'utilisateur ferait en écrivant « continue ».
   */
  if (fin.segmentsConsommes >= fin.segmentsMax) {
    return { action: 'terminer-en-echec', cause: 'annonce-sans-artefact-plafond' };
  }

  return { action: 'continuer', cause: 'annonce-sans-artefact', relance: RELANCE_ARTEFACT_MANQUANT };
}
