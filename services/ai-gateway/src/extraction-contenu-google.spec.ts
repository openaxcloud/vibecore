/*
 * BUG-AGENT-006, troisieme site — le chemin GOOGLE rendait encore ''.
 *
 * #312 a ferme deux des trois sites de `extractContent` qui produisaient une
 * chaine vide : le tableau `content[]` d'Anthropic, et le repli final. Le
 * chemin `candidates[].content.parts` de Google est reste intact avec son
 * `part.text ?? ''`.
 *
 * Or Gemini rend lui aussi des parts heterogenes — `functionCall`,
 * `inlineData`, `executableCode` — sans `.text`. Une reponse composee
 * UNIQUEMENT de telles parts redonnait '', donc un message vide persiste comme
 * s'il avait reussi : exactement le defaut mesure en production le 2026-09-01
 * (457 messages d'assistant vides sur 843, soit 54,2 %, contre 0 sur 390 cote
 * utilisateur).
 *
 * Le fournisseur Google est ACTIF en production (mesure le meme jour :
 * `enabled=true`), ce chemin est donc atteignable.
 */
import { describe, expect, it } from 'vitest';

import { ReponseFournisseurIncomprise, extractContent } from './gateway';

describe('extractContent — chemin Google', () => {
  it('1. leve au lieu de rendre une chaine vide quand AUCUNE part ne porte de texte', () => {
    const payload = {
      candidates: [{ content: { parts: [{ functionCall: { name: 'chercher' } }, { inlineData: { data: 'x' } }] } }],
    };

    expect(() => extractContent(payload)).toThrow(ReponseFournisseurIncomprise);
  });

  it('2. nomme les formes vues, pour que le cas soit diagnosticable', () => {
    const payload = {
      candidates: [{ content: { parts: [{ functionCall: { name: 'chercher' } }] } }],
    };

    try {
      extractContent(payload);
      throw new Error('aurait du lever');
    } catch (e) {
      expect(String((e as Error).message)).toContain('functionCall');
    }
  });

  it('3. rend le texte quand il y en a, en ignorant les parts sans texte', () => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'chercher' } }, { text: 'bonjour' }, { text: ' monde' }],
          },
        },
      ],
    };

    expect(extractContent(payload)).toBe('bonjour monde');
  });

  it('4. ne casse pas le cas nominal — que du texte', () => {
    const payload = { candidates: [{ content: { parts: [{ text: 'reponse complete' }] } }] };

    expect(extractContent(payload)).toBe('reponse complete');
  });
});
