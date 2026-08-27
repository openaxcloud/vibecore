import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isAnthropicProvider, withThinkingDisabled } from './anthropic-thinking';

/*
 * BUG-CHAT-THINKING-001 — « Une erreur inattendue est survenue pendant la
 * génération » (500, code UNKNOWN) sur le tier « Puissance ».
 *
 * Relevé dans les journaux du pod web en production, 18/08 :
 *
 *     stream onError code=UNKNOWN (Type validation failed: Value:
 *     {"type":"content_block_start","index":0,
 *      "content_block":{"type":"thinking","thinking":"","signature":""}}
 *
 * `claude-fable-5` émet des blocs de réflexion ; `@ai-sdk/anthropic` 0.0.39 ne
 * connaît pas ces événements et fait mourir le flux au premier d'entre eux.
 */
describe('désactivation de la réflexion étendue', () => {
  it('ne touche QUE Anthropic', () => {
    expect(withThinkingDisabled('openai', undefined)).toBeUndefined();
    expect(withThinkingDisabled('OpenAI', { openai: { store: true } })).toEqual({ openai: { store: true } });
  });

  it('reconnaît le fournisseur quelle que soit la casse', () => {
    expect(isAnthropicProvider('Anthropic')).toBe(true);
    expect(isAnthropicProvider('anthropic')).toBe(true);
    expect(isAnthropicProvider(' ANTHROPIC ')).toBe(true);
    expect(isAnthropicProvider('bedrock')).toBe(false);
    expect(isAnthropicProvider(undefined)).toBe(false);
  });

  it('demande explicitement la désactivation quand rien n’est posé', () => {
    expect(withThinkingDisabled('anthropic', undefined)).toEqual({
      anthropic: { thinking: { type: 'disabled' } },
    });
  });

  it('FUSIONNE au lieu d’écraser les options existantes', () => {
    /*
     * Écraser ferait perdre silencieusement les options d'un appelant — un
     * défaut plus difficile à voir que celui qu'on corrige.
     */
    const merged = withThinkingDisabled('anthropic', {
      anthropic: { cacheControl: 'ephemeral' },
      openai: { store: true },
    });

    expect(merged).toEqual({
      anthropic: { thinking: { type: 'disabled' }, cacheControl: 'ephemeral' },
      openai: { store: true },
    });
  });

  it('laisse gagner un `thinking` posé explicitement par l’appelant', () => {
    const merged = withThinkingDisabled('anthropic', {
      anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 } },
    });

    expect((merged?.anthropic as any).thinking).toEqual({ type: 'enabled', budgetTokens: 1024 });
  });
});

describe('câblage dans le flux', () => {
  const streamText = readFileSync('app/lib/.server/llm/stream-text.ts', 'utf8');

  it('les paramètres du flux passent par la désactivation', () => {
    expect(streamText).toContain('withThinkingDisabled(');
    expect(streamText).toContain("from './anthropic-thinking'");
  });
});

describe('rappel de dette', () => {
  it('le contournement se retire quand le SDK est monté', () => {
    /*
     * Ce test échouera dès que quelqu'un montera `@ai-sdk/anthropic` : c'est
     * voulu. Il force à revenir ici et à supprimer le contournement plutôt que
     * de le laisser vivre indéfiniment.
     */
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(
      pkg.dependencies['@ai-sdk/anthropic'],
      'SDK monté : retirer le contournement `anthropic-thinking.ts` et réactiver la réflexion',
    ).toBe('0.0.39');
  });
});
