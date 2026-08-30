import { describe, expect, it } from 'vitest';

import { getAssistantMessageCopy } from '~/lib/i18n/catalogs/assistant-message';
import { getChatControlsCopy } from '~/lib/i18n/catalogs/chat-controls';

/**
 * AGENT-MSG-001 — un mode d'agent porte UN nom, pas deux.
 *
 * Constaté en prod (IDE en français) : le composer proposait « Léger /
 * Économique / Puissance » pendant que le badge du message affichait
 * « Lite / Economy / Power ». Le catalogue FR de `assistant-message` avait été
 * recopié depuis l'anglais sans être traduit : deux noms pour une même chose,
 * dont un en anglais au milieu d'une interface française.
 */
describe('AGENT-MSG-001 — noms des modes d’agent', () => {
  const paires = [
    ['lite', 'assistantMessage.mode.lite', 'chatControls.power.tier.lite'],
    ['economy', 'assistantMessage.mode.economy', 'chatControls.power.tier.economy'],
    ['power', 'assistantMessage.mode.power', 'chatControls.power.tier.power'],
  ] as const;

  for (const langue of ['en', 'fr'] as const) {
    it(`le badge du message et le composer nomment le mode pareil (${langue})`, () => {
      const message = getAssistantMessageCopy(langue) as Record<string, string>;
      const composer = getChatControlsCopy(langue) as Record<string, string>;

      for (const [mode, cleMessage, cleComposer] of paires) {
        expect(message[cleMessage], `mode ${mode} côté message (${langue})`).toBe(composer[cleComposer]);
      }
    });
  }

  it('ne laisse aucun nom de mode en anglais dans le catalogue français', () => {
    const message = getAssistantMessageCopy('fr') as Record<string, string>;

    expect([
      message['assistantMessage.mode.lite'],
      message['assistantMessage.mode.economy'],
      message['assistantMessage.mode.power'],
    ]).toEqual(['Léger', 'Économique', 'Puissance']);
  });
});
