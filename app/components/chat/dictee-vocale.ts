/*
 * Dictée vocale du composeur — la logique pure, hors React.
 *
 * BUG-VOICE-INPUT-001 (Avi, 07/09 : « on comprend rien, c'est mal fait »).
 * Mesuré avant correction, Chromium 390 avec un moteur factice :
 *   - `start()` sans langue : le moteur prend celle du navigateur ;
 *   - la dictée REMPLAÇAIT le texte déjà tapé (« Bonjour  » → « je veux… ») ;
 *   - quand le moteur s'arrêtait seul (silence, ce que fait Safari iOS après
 *     quelques secondes), rien ne l'écoutait : l'interface restait « en
 *     écoute », l'appui suivant appelait `stop()` sur un moteur arrêté, et il
 *     fallait un troisième appui pour repartir.
 *
 * Tout ce qui décide vit ici, sous test : la phase, la langue, la fusion du
 * texte, la traduction d'une erreur en message.
 */

export type PhaseDictee = 'repos' | 'demande' | 'ecoute';

export type EvenementDictee =
  | { type: 'appui' }
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'erreur' }
  | { type: 'envoi' };

export type ActionDictee = 'start' | 'stop' | 'abort';

export interface TransitionDictee {
  phase: PhaseDictee;
  action?: ActionDictee;
}

/*
 * Une seule machine, pour que le bouton, le champ et le moteur ne divergent
 * jamais : l'appui bascule, le moteur confirme (`start`) ou termine (`end`,
 * erreur), l'envoi coupe court.
 */
export function reduireLaDictee(phase: PhaseDictee, evenement: EvenementDictee): TransitionDictee {
  switch (evenement.type) {
    case 'appui':
      return phase === 'repos' ? { phase: 'demande', action: 'start' } : { phase: 'repos', action: 'stop' };
    case 'start':
      return { phase: 'ecoute' };
    case 'end':
    case 'erreur':
      return { phase: 'repos' };
    case 'envoi':
      return phase === 'repos' ? { phase: 'repos' } : { phase: 'repos', action: 'abort' };
    default:
      return { phase };
  }
}

const REGIONS_PAR_DEFAUT: Readonly<Record<string, string>> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  ar: 'ar-SA',
  nl: 'nl-NL',
};

/* La langue de l'interface, en étiquette BCP 47 régionale — celle que les moteurs comprennent le mieux. */
export function langueDeDictee(langue: string | null | undefined): string {
  const brute = (langue ?? '').trim();

  if (!brute) {
    return 'en-US';
  }

  if (brute.includes('-')) {
    return brute;
  }

  return REGIONS_PAR_DEFAUT[brute.toLowerCase()] ?? brute;
}

/* Le texte déjà tapé reste ; la dictée s'y ajoute, avec l'espace qui manque. */
export function composerLaSaisie(prefixe: string, transcription: string): string {
  const dicte = transcription.trim();

  if (!dicte) {
    return prefixe;
  }

  if (!prefixe) {
    return dicte;
  }

  return /\s$/.test(prefixe) ? `${prefixe}${dicte}` : `${prefixe} ${dicte}`;
}

interface AlternativeLisible {
  transcript: string;
}

/*
 * Les résultats d'un moteur continu s'accumulent phrase par phrase ; Safari
 * ne met pas d'espace entre deux phrases, Chrome si. On joint en ajoutant
 * l'espace seulement quand il manque.
 */
export function transcriptionDepuisResultats(resultats: ArrayLike<ArrayLike<AlternativeLisible>>): string {
  let texte = '';

  for (let i = 0; i < resultats.length; i += 1) {
    const meilleure = resultats[i]?.[0];
    const morceau = meilleure ? meilleure.transcript : '';

    if (!morceau) {
      continue;
    }

    texte = texte && !/\s$/.test(texte) && !/^\s/.test(morceau) ? `${texte} ${morceau}` : `${texte}${morceau}`;
  }

  return texte;
}

export type MessageDictee = 'permission' | 'micro-absent' | 'reseau' | 'silence';

/* Ce qu'on dit à l'utilisateur pour chaque code d'erreur du moteur — ou rien. */
export function messageDErreurDeDictee(code: string | undefined): MessageDictee | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission';
    case 'audio-capture':
      return 'micro-absent';
    case 'network':
      return 'reseau';
    case 'no-speech':
      return 'silence';
    default:
      return null;
  }
}
