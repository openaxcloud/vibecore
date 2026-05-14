/**
 * Detect the language of the prompt the user typed into /projects/new so the
 * downstream agent answers in the same language and so the form can surface
 * a subtle "Detected: French" indicator.
 *
 * Why franc-min and not a heuristic:
 *
 *  - franc-min is the same trigram classifier the official Mozilla / Yarn
 *    docs sites use. It ships about 13 KB gzipped and a JSON of trigram
 *    fingerprints for ~80 languages, no native deps.
 *
 *  - It correctly tags short, polished product briefs (3-15 words) in the
 *    languages our users speak most often — French, English, Spanish,
 *    German, Italian, Portuguese, Japanese, Korean, Chinese, Arabic.
 *
 *  - When the input is too short or ambiguous franc returns the ISO-639-3
 *    code `'und'` (undetermined) and we don't pretend to know.
 */

import { franc } from 'franc-min';

/** Minimum character count below which we refuse to guess. */
export const LANGUAGE_DETECTION_MIN_CHARS = 12;

/**
 * Languages we surface as a "Detected: X" hint and whose name we want to
 * inject into the generation prompt. Keep the list to the languages our
 * users actually type in; for anything else we keep the ISO code and let
 * the agent figure it out.
 *
 * Keys are ISO 639-3 codes (`franc`'s output). Values are English-language
 * display names because the rest of the IDE chrome is English.
 */
export const SUPPORTED_LANGUAGES: Readonly<Record<string, string>> = {
  ara: 'Arabic',
  cmn: 'Chinese',
  deu: 'German',
  eng: 'English',
  fra: 'French',
  hin: 'Hindi',
  ita: 'Italian',
  jpn: 'Japanese',
  kor: 'Korean',
  nld: 'Dutch',
  pol: 'Polish',
  por: 'Portuguese',
  rus: 'Russian',
  spa: 'Spanish',
  swe: 'Swedish',
  tur: 'Turkish',
  ukr: 'Ukrainian',
  vie: 'Vietnamese',
};

export interface DetectedLanguage {
  /** ISO 639-3 code (`'und'` when undetermined). */
  code: string;

  /** English-language display name. `undefined` when not in SUPPORTED_LANGUAGES. */
  name?: string;

  /**
   * True when the detection is confident enough to surface in the UI and
   * inject into the LLM prompt (input long enough + a known language code).
   */
  reliable: boolean;
}

/**
 * Detect the language of `text`. Returns `{ code: 'und', reliable: false }`
 * for empty / short / unrecognised input.
 */
export function detectPromptLanguage(text: string | null | undefined): DetectedLanguage {
  if (!text || typeof text !== 'string') {
    return { code: 'und', reliable: false };
  }

  const trimmed = text.trim();

  if (trimmed.length < LANGUAGE_DETECTION_MIN_CHARS) {
    return { code: 'und', reliable: false };
  }

  let code: string;

  try {
    code = franc(trimmed, { minLength: LANGUAGE_DETECTION_MIN_CHARS });
  } catch {
    return { code: 'und', reliable: false };
  }

  if (!code || code === 'und') {
    return { code: 'und', reliable: false };
  }

  const name = SUPPORTED_LANGUAGES[code];

  return {
    code,
    name,
    reliable: Boolean(name),
  };
}
