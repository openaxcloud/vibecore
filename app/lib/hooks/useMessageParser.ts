import type { Message } from 'ai';
import { useCallback, useState } from 'react';
import { detectUserLanguage } from '~/lib/i18n/language';
import { arbitreDe, decoderLane, identifiantDeLane, textesDesLanes } from '~/lib/runtime/agent-lane-writes';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import {
  analyserGeneration,
  fichiersDepuisArborescence,
  generationEstHonnete,
} from '~/lib/runtime/generation-incomplete';
import { constatDeGenerationStore } from '~/lib/stores/constat-de-generation';
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
/*
 * LES TOURS OÙ L'UTILISATEUR A DIT « AUCUN FICHIER ».
 *
 * Le serveur les marque d'une annotation `consigneSansFichier` (api.chat.ts),
 * posée avant toute génération. C'est une BARRIÈRE, pas une consigne de plus au
 * modèle : mesuré en production le 2026-09-30, « N'écris aucun fichier » a été
 * respecté par l'agent principal et ignoré par deux sous-agents, dont les
 * fichiers ont atterri dans le projet. Un modèle ne garantit rien ; le moteur,
 * lui, peut refuser. Toute action de ces tours — fichier, commande, démarrage —
 * est donc refusée, celles des sous-agents comprises.
 */
const toursSansFichier = new Set<string>();
const refusDejaSignales = new Set<string>();

function consigneSansFichier(message: Message): boolean {
  return (message.annotations ?? []).some(
    (annotation) =>
      typeof annotation === 'object' &&
      annotation !== null &&
      (annotation as { type?: unknown }).type === 'consigneSansFichier',
  );
}

function ecritureAutorisee(data: {
  messageId: string;
  actionId?: string;
  action: { type: string; filePath?: string };
}): boolean {
  const lane = decoderLane(data.messageId);

  if (toursSansFichier.has(lane?.messageId ?? data.messageId)) {
    const cle = `${data.messageId}:${data.actionId ?? data.action.filePath ?? data.action.type}`;

    if (!refusDejaSignales.has(cle)) {
      refusDejaSignales.add(cle);
      logger.warn(
        JSON.stringify({
          event: 'ecriture.refusee.consigne',
          messageId: data.messageId,
          type: data.action.type,
          filePath: data.action.filePath,
        }),
      );
    }

    return false;
  }

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

      /*
       * Un nouveau tour commence : le constat d'honnêteté du précédent ne le
       * concerne plus. Sans cette remise à zéro, une génération tronquée
       * teindrait le bandeau du tour SUIVANT, qui s'est peut-être très bien
       * passé — un faux négatif est un mensonge dans l'autre sens.
       */
      constatDeGenerationStore.set(undefined);

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
       *
       * UN SOUS-AGENT COUPÉ N'EST PAS UNE GÉNÉRATION ARRÊTÉE. Mesuré en
       * production le 2026-09-30, trois tours sur trois : le rôle « frontend »
       * atteint son plafond de jetons, son artefact est refermé par le filet, et
       * le bandeau annonce « la génération s'est arrêtée en route — l'application
       * ne peut pas démarrer » alors que le coordinateur a fini proprement
       * (`finishReason: stop`) et que le constat lui-même ne trouve AUCUNE entrée
       * manquante. Le coordinateur intègre le travail des rôles ; c'est SA fin
       * qui dit si la génération est complète.
       */
      const lane = decoderLane(data.messageId);

      if (data.fermetureDeSecours && lane) {
        logger.warn(JSON.stringify({ event: 'lane.tronquee', artifactId: data.artifactId, roleId: lane.roleId }));
      } else if (data.fermetureDeSecours) {
        logger.warn('Artefact fermé par le filet de fin de flux (balise </boltArtifact> absente)', data.artifactId);

        /*
         * LA GARDE D'HONNÊTETÉ ÉTAIT ÉCRITE, TESTÉE, ET APPELÉE NULLE PART.
         *
         * `analyserGeneration` n'était importé que par son propre spec —
         * vérifié avec témoin positif. Le module existait pour dire qu'une
         * génération tronquée ne peut pas démarrer, et personne ne le lui
         * demandait : le produit continuait donc d'annoncer une réussite sur un
         * projet sans point d'entrée. Une règle juste que rien n'appelle ne
         * protège de rien.
         *
         * On la branche ICI parce que c'est le seul endroit qui sait que le
         * filet a fermé l'artefact — l'information ne survit nulle part
         * ailleurs. La ligne est structurée et greppable : son comptage est
         * précisément ce que l'en-tête du module réclame pour décider si le
         * filet est un garde-fou ou une réparation majeure.
         */
        try {
          const constat = analyserGeneration(fichiersDepuisArborescence(workbenchStore.files.get()), {
            fermetureDeSecours: true,
          });

          logger.warn(
            JSON.stringify({
              event: 'generation.tronquee',
              artifactId: data.artifactId,
              honnete: generationEstHonnete(constat),
              entreesManquantes: constat.entreesManquantes,
            }),
          );

          /*
           * LA MOITIÉ VISIBLE. Un journal ne prévient que nous ; l'utilisateur,
           * lui, voyait toujours « les patchs ont bien été appliqués » sur une
           * application sans point d'entrée. On publie le constat pour que le
           * bandeau le dise à l'écran.
           */
          constatDeGenerationStore.set(constat);
        } catch (erreur) {
          /*
           * Une garde d'observation ne doit JAMAIS casser l'écriture des
           * fichiers qu'elle observe : le filet vient de sauver le travail de
           * l'utilisateur, et un diagnostic raté ne peut pas le reprendre.
           */
          logger.warn('analyse de génération tronquée impossible', (erreur as Error)?.message);
        }
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
       * LE FICHIER TRONQUÉ D'UN SOUS-AGENT NE S'ÉCRIT PAS. Le filet referme les
       * lanes à la FIN du tour entier — donc APRÈS que le coordinateur a écrit
       * ses propres fichiers. Écrire ici le morceau reçu du rôle coupé, c'est
       * remplacer la version intégrée et complète par un début de fichier. Le
       * coordinateur intègre ; le morceau est abandonné, et dit.
       */
      if (data.fermetureDeSecours && decoderLane(data.messageId)) {
        logger.warn(
          JSON.stringify({
            event: 'lane.fichier-tronque.ignore',
            messageId: data.messageId,
            type: data.action.type,
            filePath: 'filePath' in data.action ? data.action.filePath : undefined,
          }),
        );

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

/*
 * Messages à REPARSER DEPUIS LE DÉBUT — voir `rejouerLeMessage`. La valeur est
 * le contenu complet attendu : le rejeu n'a lieu que quand le message porte
 * CE contenu, jamais sur un rendu intermédiaire de l'ancienne version.
 */
const messagesARejouer = new Map<string, string>();

/**
 * Rejouer un message depuis le début, pour le rattrapage à la reprise.
 *
 * Le parseur est INCRÉMENTAL : il retient, par message, la position déjà lue.
 * Quand la réponse complète revient du serveur, lui donner le texte entier ne
 * rejouerait que la suite — et le fichier que la coupure avait laissé ouvert ne
 * recevrait jamais sa vraie fermeture. On oublie donc l'état de ce message au
 * passage où il porte le contenu complet : le parseur relit tout, les actions
 * déjà terminées sont reconnues et sautées par le moteur, le fichier
 * interrompu est réécrit, les suivantes s'exécutent.
 *
 * Attendre le contenu complet n'est pas une précaution de style : un passage
 * intermédiaire sur l'ANCIENNE version, remis à zéro, refermerait le fichier
 * tronqué une seconde fois — et l'écrirait tronqué.
 */
export function rejouerLeMessage(messageId: string, contenuComplet: string) {
  messagesARejouer.set(messageId, contenuComplet);
}

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

        /* Avant de parser : la barrière doit précéder la première action du tour. */
        if (message.role === 'assistant' && consigneSansFichier(message)) {
          toursSansFichier.add(message.id);
        }

        let replaceContent = reset;

        if (messagesARejouer.get(message.id) === extractTextContent(message)) {
          messagesARejouer.delete(message.id);
          messageParser.resetMessage(message.id);
          replaceContent = true;
        }

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
