import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';
import { projectAiTranscriptMessages } from './project-ai-transcript-messages';

const question: Message = { id: 'u1', role: 'user', content: 'Renomme le service.' };

describe('transcription envoyée au serveur', () => {
  it('n’envoie PAS la bulle de l’agent tant qu’elle est vide', () => {
    /*
     * Mesuré en production sur 10 générations : 20 messages d'assistant écrits,
     * dont 10 vides — un fantôme par échange, en alternance stricte. La
     * transcription était envoyée PENDANT le streaming, alors que la bulle
     * était encore vide.
     */
    const envoye = projectAiTranscriptMessages([question, { id: 'a1', role: 'assistant', content: '' }]);

    expect(
      envoye.map((m) => m.role),
      'la bulle vide ne doit pas être persistée',
    ).toEqual(['user']);
  });

  it('envoie la bulle dès qu’elle porte du texte', () => {
    const envoye = projectAiTranscriptMessages([question, { id: 'a1', role: 'assistant', content: 'C’est fait.' }]);

    expect(envoye.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('envoie une bulle sans texte MAIS avec des appels d’outils', () => {
    /*
     * Un appel d'outil est un contenu à part entière : le filtrer perdrait la
     * trace de ce que l'agent a réellement fait.
     */
    const avecOutil = {
      id: 'a1',
      role: 'assistant',
      content: '',
      toolInvocations: [{ toolName: 'lire', state: 'result' }],
    } as unknown as Message;

    expect(projectAiTranscriptMessages([question, avecOutil]).map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('donne un identifiant STABLE quand le message n’en porte pas', () => {
    /*
     * Le second mécanisme du même défaut. L'identifiant de repli contenait les
     * 80 premiers caractères du contenu : il changeait dès que le texte
     * arrivait. Or la route persiste par `upsert` sur cet identifiant — un
     * identifiant instable crée donc une SECONDE ligne au lieu de mettre à jour
     * la première.
     */
    const sansId = (content: string) =>
      ({ role: 'assistant', content, toolInvocations: [{ t: 1 }] }) as unknown as Message;

    const debut = projectAiTranscriptMessages([question, sansId('Je com')]);

    const fin = projectAiTranscriptMessages([
      question,
      sansId('Je commence par renommer le service, puis je relance la synchronisation.'),
    ]);

    expect(debut[1].clientId, 'l’identifiant doit survivre à l’arrivée du texte').toBe(fin[1].clientId);
  });

  it('respecte toujours l’exclusion explicite', () => {
    const exclu = { id: 'a1', role: 'assistant', content: 'secret', annotations: ['no-store'] } as unknown as Message;

    expect(projectAiTranscriptMessages([question, exclu]).map((m) => m.role)).toEqual(['user']);
  });
});
