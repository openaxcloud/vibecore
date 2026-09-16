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
    ['power', 'assistantMessage.mode.power', 'chatControls.power.tier.power'],
    ['max', 'assistantMessage.mode.max', 'chatControls.power.tier.max'],
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

  /*
   * Le défaut d'origine était DEUX noms pour une même chose : le composer disait
   * « Léger / Économique / Puissance » quand le badge disait « Lite / Economy /
   * Power ». Depuis le renommage du 2026-09-16, les trois modes sont des NOMS DE
   * PRODUIT — Lite, Power, Max — identiques dans les deux langues. Ce que ce test
   * tient n'a pas changé : les deux surfaces doivent dire la MÊME chose.
   */
  it('nomme les modes pareil dans les deux catalogues français', () => {
    const message = getAssistantMessageCopy('fr') as Record<string, string>;
    const composer = getChatControlsCopy('fr') as Record<string, string>;

    expect([
      message['assistantMessage.mode.lite'],
      message['assistantMessage.mode.power'],
      message['assistantMessage.mode.max'],
    ]).toEqual(['Lite', 'Power', 'Max']);

    expect([
      composer['chatControls.power.tier.lite'],
      composer['chatControls.power.tier.power'],
      composer['chatControls.power.tier.max'],
    ]).toEqual(['Lite', 'Power', 'Max']);
  });
});
