import type { Message } from 'ai';
import { useCallback, useState } from 'react';
import { detectUserLanguage } from '~/lib/i18n/language';
import { arbitreDe, decoderLane, identifiantDeLane, textesDesLanes } from '~/lib/runtime/agent-lane-writes';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

/*
 * L'ARBITRE DES ECRITURES ENTRE ROLES.
 *
 * Les sous-agents ecrivent maintenant leurs fichiers eux-memes, en parallele.
 * Deux d'entre eux peuvent viser le meme chemin — la passerelle sait DETECTER
 * ce cas (`detectFileOverlapConflicts`, contre-epreuve du 2026-09-07) mais pas
 * l'arbitrer, et sa description ne porte que la cle minusculisee : on ne peut
 * donc pas en deduire ou ecrire. L'arbitrage se fait ici, au site d'ecriture,
 * sur les chemins d'origine.
 */

/**
 * Une action de fichier venant d'une lane peut-elle s'appliquer ?
 *
 * Le flux du coordinateur n'est JAMAIS arbitre : `decoderLane` rend `undefined`
 * pour un identifiant de message ordinaire, et on laisse passer. C'est ce qui
 * garantit qu'un projet sans sous-agents se comporte exactement comme avant.
 */
function ecritureAutorisee(data: { messageId: string; action: { type: string; filePath?: string } }): boolean {
  const lane = decoderLane(data.messageId);

  if (!lane || data.action.type !== 'file' || !data.action.filePath) {
    return true;
  }

  const decision = arbitreDe(lane.messageId).peutEcrire(data.action.filePath, lane.rang);

  if (!decision.autorisee) {
    logger.trace('ecriture refusee par arbitrage', data.action.filePath, lane.roleId);
  }

  return decision.autorisee;
}

const messageParser = new EnhancedStreamingMessageParser({
  language: detectUserLanguage,
  callbacks: {
    onArtifactOpen: (data) => {
      logger.trace('onArtifactOpen', data);

      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data) => {
      /*
       * Deux fermetures possibles, et on les DISTINGUE dans le journal : une
       * balise `</boltArtifact>` reçue, ou le filet de fin de flux. Sans cette
       * distinction, la fréquence réelle des flux tronqués reste introuvable —
       * et c'est le chiffre qui décide si le filet est un garde-fou ou une
       * réparation majeure.
       */
      if (data.fermetureDeSecours) {
        logger.warn('Artefact fermé par le filet de fin de flux (balise </boltArtifact> absente)', data.artifactId);
      } else {
        logger.trace('onArtifactClose');
      }

      workbenchStore.updateArtifact(data, { closed: true });
    },
    onActionOpen: (data) => {
      logger.trace('onActionOpen', data.action);

      if (!ecritureAutorisee(data)) {
        return;
      }

      /*
       * File actions are streamed, so we add them immediately to show progress
       * Shell actions are complete when created by enhanced parser, so we wait for close
       */
      if (data.action.type === 'file') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      logger.trace('onActionClose', data.action);

      if (!ecritureAutorisee(data)) {
        return;
      }

      /*
       * Add non-file actions (shell, build, start, etc.) when they close
       * Enhanced parser creates complete shell actions, so they're ready to execute
       */
      if (data.action.type !== 'file') {
        workbenchStore.addAction(data);
      }

      workbenchStore.runAction(data);
    },
    onActionStream: (data) => {
      logger.trace('onActionStream', data.action);

      if (!ecritureAutorisee(data)) {
        return;
      }

      workbenchStore.runAction(data, true);
    },
  },
});
const extractTextContent = (message: Message) =>
  Array.isArray(message.content)
    ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
    : message.content;

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    let reset = false;

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
    }

    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant' || message.role === 'user') {
        let newParsedContent = '';

        let replaceContent = reset;

        try {
          newParsedContent = messageParser.parse(message.id, extractTextContent(message));

          /*
           * When the enhanced parser rewrites detected code blocks into artifacts
           * it does a reset()+full-reparse, so its return is the COMPLETE message
           * content, not an incremental delta. Appending it would duplicate the
           * body (the raw streamed text + the re-parsed artifact). Replace instead.
           */
          if (messageParser.consumeDidReset(message.id)) {
            replaceContent = true;
          }
        } catch (error) {
          /*
           * A single malformed tag from the model (e.g. an invalid supabase
           * action) must not abort parsing for this and every subsequent
           * message in the batch. Reset just this message's parser state and
           * continue rather than freezing the whole file/preview pipeline.
           */
          logger.error('Failed to parse assistant message; skipping', error);

          /*
           * Reset ONLY this message's parser state — a global reset() wipes the
           * accumulated stream position of every OTHER in-flight message in the
           * batch (the comment above always intended per-message scoping; the
           * code was using the global reset).
           */
          messageParser.resetMessage(message.id);
        }

        /*
         * FILET DE FIN DE FLUX. `onArtifactClose` n'est émis que sur une balise
         * `</boltArtifact>` trouvée — c'est l'UNIQUE site du dépôt qui pose
         * `closed: true`, et il n'a aucun repli. Un flux tronqué par une limite
         * de jetons, une erreur de fournisseur ou un abandon laisse donc
         * l'artefact ouvert pour toujours, et TOUT ce qui pend à sa fermeture
         * ne s'exécute jamais — à commencer par la persistance des fichiers
         * vers le stockage durable : du code produit, affiché, et perdu.
         *
         * On ferme dès que ce message ne coule plus. `isLoading` retombe à faux
         * aussi bien sur une fin normale que sur une erreur ou un abandon —
         * c'est précisément le cas tronqué qu'on veut couvrir, et il ne passe
         * pas par une fin propre.
         *
         * Idempotent : `fermerArtefactsOuverts` ne rend `true` que s'il restait
         * réellement un artefact ouvert. Un message déjà clos par sa balise ne
         * déclenche rien.
         */
        if (message.role === 'assistant' && !isLoading) {
          messageParser.fermerArtefactsOuverts(message.id);
        }

        /*
         * LES FICHIERS ECRITS PAR LES SOUS-AGENTS.
         *
         * Le contenu des lanes arrive par les annotations `agentLaneStream`, pas
         * dans `message.content` — deux tuyaux voisins qui ne se touchent pas. Le
         * parseur ne voyait donc JAMAIS ce que les roles produisaient.
         *
         * On lui donne le texte de chaque lane sous son PROPRE identifiant :
         * `StreamingMessageParser` indexe son etat par message, donc quatre roles
         * se parsent en parallele sans melanger leurs artefacts. Les ecritures
         * passent ensuite par l'arbitre, qui tranche les chemins revendiques par
         * plusieurs roles.
         *
         * Inerte pour un message sans annotation de lane : `textesDesLanes` rend
         * une carte vide et rien ne s'execute.
         */
        if (message.role === 'assistant') {
          for (const [roleId, texte] of textesDesLanes(message.annotations)) {
            const idDeLane = identifiantDeLane(message.id, roleId);

            try {
              messageParser.parse(idDeLane, texte);
            } catch (error) {
              logger.error('Failed to parse sub-agent lane; skipping', roleId, error);
              messageParser.resetMessage(idDeLane);
              continue;
            }

            /*
             * Meme filet de fin de flux que pour le coordinateur : une lane
             * tronquee laisserait son artefact ouvert pour toujours, et tout ce
             * qui pend a la fermeture — a commencer par la persistance vers le
             * stockage durable — ne s'executerait jamais.
             */
            if (!isLoading) {
              messageParser.fermerArtefactsOuverts(idDeLane);
            }
          }
        }

        setParsedMessages((prevParsed) => ({
          ...prevParsed,
          [index]: !replaceContent ? (prevParsed[index] || '') + newParsedContent : newParsedContent,
        }));
      }
    }
  }, []);

  return { parsedMessages, parseMessages };
}
