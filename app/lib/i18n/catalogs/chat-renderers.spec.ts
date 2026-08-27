import { describe, expect, it } from 'vitest';

import {
  chatRenderersEn,
  chatRenderersFr,
  formatChatRendererDuration,
  formatChatRenderersCopy,
  formatChatRenderersPlural,
  getChatRenderersCopy,
} from './chat-renderers';

describe('chat renderers i18n catalog', () => {
  it('keeps strict English and French key parity', () => {
    expect(Object.keys(chatRenderersFr).sort()).toEqual(Object.keys(chatRenderersEn).sort());
  });

  it('falls back to English and selects French explicitly', () => {
    expect(getChatRenderersCopy('de')['chatRenderers.diff.edit']).toBe('Edit');
    expect(getChatRenderersCopy('fr-FR')['chatRenderers.diff.edit']).toBe('Modifier');
  });

  it('formats French plurals, interpolation, and decimal durations', () => {
    const copy = getChatRenderersCopy('fr');

    expect(
      formatChatRenderersPlural('fr', 2, {
        one: copy['chatRenderers.diff.added_one'],
        other: copy['chatRenderers.diff.added_other'],
      }),
    ).toBe('2 lignes ajoutées');
    expect(formatChatRenderersCopy(copy['chatRenderers.artifact.openFile'], { path: 'src/App.tsx' })).toBe(
      'Ouvrir src/App.tsx',
    );
    expect(formatChatRendererDuration('fr', 1_500)).toBe('1,5\u00a0s');
    expect(formatChatRendererDuration('en', 61_000)).toBe('1\u00a0min 1\u00a0s');
  });
});
