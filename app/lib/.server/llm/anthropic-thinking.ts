import type { JSONValue } from 'ai';

/**
 * Désactivation explicite de la réflexion étendue chez Anthropic.
 *
 * CORRECTIF DE CONTOURNEMENT, volontairement temporaire.
 *
 * `claude-fable-5` émet des blocs de réflexion (`thinking`, `thinking_delta`,
 * `signature_delta`) dans son flux. Le SDK installé — `@ai-sdk/anthropic`
 * 0.0.39, très en retard sur `ai@4.3.16` — ne connaît pas ces événements : sa
 * validation de schéma les rejette, le flux meurt, et l'utilisateur reçoit
 * « Une erreur inattendue est survenue pendant la génération » (500, code
 * UNKNOWN). Relevé en production le 18/08 sur le tier « Puissance » :
 *
 *     stream onError code=UNKNOWN (Type validation failed: Value:
 *     {"type":"content_block_start","index":0,
 *      "content_block":{"type":"thinking","thinking":"","signature":""}}
 *
 * Le HTTP est pourtant à 200 : le flux démarre, puis meurt au premier chunk de
 * réflexion. D'où l'intermittence — seules les générations où le modèle décide
 * de réfléchir échouent, ce qui vise surtout le tier « Puissance ».
 *
 * On demande donc explicitement `thinking: { type: 'disabled' }`. Le vrai
 * correctif est de monter le SDK ; ce fichier doit disparaître à ce moment-là,
 * et son test de non-régression le rappelle.
 */

/** Les fournisseurs dont le flux passe par le schéma Anthropic. */
export function isAnthropicProvider(providerName: string | undefined): boolean {
  return (providerName ?? '').trim().toLowerCase() === 'anthropic';
}

/**
 * Fusionne l'option de désactivation dans les `providerOptions` existantes.
 *
 * On FUSIONNE au lieu d'écraser : un appelant peut déjà porter des options pour
 * Anthropic (ou pour un autre fournisseur) et les perdre ici serait un défaut
 * silencieux. Une valeur `thinking` posée explicitement par l'appelant gagne —
 * ce contournement est un défaut, pas une politique.
 */
export type ProviderOptionsShape = Record<string, Record<string, JSONValue>>;

export function withThinkingDisabled(
  providerName: string | undefined,
  existing: ProviderOptionsShape | undefined,
): ProviderOptionsShape | undefined {
  if (!isAnthropicProvider(providerName)) {
    return existing;
  }

  const anthropic = existing?.anthropic ?? {};

  return {
    ...existing,
    anthropic: {
      thinking: { type: 'disabled' },
      ...anthropic,
    },
  };
}
