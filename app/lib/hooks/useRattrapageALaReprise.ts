import type { Message } from 'ai';
import { useCallback, useEffect, useRef } from 'react';
import type { ProjectAiMessagesResponse } from '~/components/chat/projectAiTranscript';
import {
  planDeRattrapage,
  rattrapageEncoreOuvert,
  RATTRAPAGE_INTERVALLE_MS,
  type PlanDeRattrapage,
} from '~/lib/chat/rattrapage-reprise';
import { rejouerLeMessage } from '~/lib/hooks/useMessageParser';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('rattrapage');

interface Options {
  enabled: boolean;
  projectId?: string;
  isLoading: boolean;
  conversationId: () => string | undefined;
  messages: () => Message[];
  appliquer: (messages: Message[]) => void;
}

/**
 * Applique un plan au fil. Les parties texte sont remplacées elles aussi : le
 * SDK les renvoie au serveur au tour suivant, et une partie restée tronquée
 * donnerait au modèle un historique amputé.
 */
export function filApresRattrapage(fil: Message[], plan: PlanDeRattrapage): Message[] {
  if (plan.type === 'ajouter') {
    return [...fil, { id: plan.message.id, role: 'assistant', content: plan.message.content } as Message];
  }

  return fil.map((message) => {
    if (message.id !== plan.messageId) {
      return message;
    }

    const autresParties = (message.parts ?? []).filter((partie) => partie.type !== 'text');

    return {
      ...message,
      content: plan.contenu,
      parts: [...autresParties, { type: 'text', text: plan.contenu }],
    } as Message;
  });
}

/**
 * Après une fin de flux ANORMALE, relit la conversation jusqu'à ce que la
 * réponse complète écrite par le serveur (#609) y apparaisse, puis la rejoue :
 * texte ET fichiers.
 *
 * On relit à intervalle fixe, et tout de suite quand l'onglet redevient visible
 * ou que le réseau revient — c'est exactement le moment où Safari rend la main.
 * Un nouvel envoi annule le rattrapage : le fil appartient alors au tour suivant.
 */
export function useRattrapageALaReprise({
  enabled,
  projectId,
  isLoading,
  conversationId,
  messages,
  appliquer,
}: Options) {
  const enCours = useRef<{ debut: number } | null>(null);
  const lectureEnCours = useRef(false);

  const tenter = useCallback(async () => {
    const etat = enCours.current;

    if (!etat || lectureEnCours.current || !projectId) {
      return;
    }

    if (!rattrapageEncoreOuvert(etat.debut, Date.now())) {
      logger.warn(JSON.stringify({ event: 'rattrapage.abandonne', attenteMs: Date.now() - etat.debut }));
      enCours.current = null;

      return;
    }

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    const conversation = conversationId();

    if (!conversation) {
      return;
    }

    lectureEnCours.current = true;

    try {
      const reponse = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/ai/conversations/${encodeURIComponent(conversation)}/messages`,
      );

      if (!reponse.ok || enCours.current !== etat) {
        return;
      }

      const corps = (await reponse.json()) as ProjectAiMessagesResponse;
      const fil = messages();

      const plan = await planDeRattrapage(
        conversation,
        fil.map((message) => ({ id: message.id, role: message.role, content: String(message.content ?? '') })),
        corps.messages ?? [],
      );

      if (!plan || enCours.current !== etat) {
        return;
      }

      enCours.current = null;

      const messageId = plan.type === 'ajouter' ? plan.message.id : plan.messageId;
      const contenu = plan.type === 'ajouter' ? plan.message.content : plan.contenu;

      workbenchStore.autoriserLaReprise(messageId);

      if (plan.type === 'completer') {
        rejouerLeMessage(messageId, contenu);
      }

      logger.info(
        JSON.stringify({
          event: 'rattrapage.applique',
          type: plan.type,
          messageId,
          caracteres: contenu.length,
          attenteMs: Date.now() - etat.debut,
        }),
      );

      appliquer(filApresRattrapage(fil, plan));
    } catch (erreur) {
      logger.warn('lecture de la conversation impossible, nouvel essai au prochain tour', (erreur as Error)?.message);
    } finally {
      lectureEnCours.current = false;
    }
  }, [appliquer, conversationId, messages, projectId]);

  const armer = useCallback(() => {
    if (!enabled || !projectId) {
      return;
    }

    enCours.current = { debut: Date.now() };
    logger.info(JSON.stringify({ event: 'rattrapage.arme' }));
    void tenter();
  }, [enabled, projectId, tenter]);

  useEffect(() => {
    if (isLoading) {
      enCours.current = null;
    }
  }, [isLoading]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const minuterie = window.setInterval(() => void tenter(), RATTRAPAGE_INTERVALLE_MS);
    const surReprise = () => void tenter();

    document.addEventListener('visibilitychange', surReprise);
    window.addEventListener('online', surReprise);
    window.addEventListener('pageshow', surReprise);

    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', surReprise);
      window.removeEventListener('online', surReprise);
      window.removeEventListener('pageshow', surReprise);
    };
  }, [enabled, tenter]);

  return { armer };
}
