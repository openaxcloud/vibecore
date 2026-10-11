---
id: BUG-QA1011-ONGLET-RENVOIE-LA-CONVERSATION
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug (A-11 de PROBLEMES.md)

**Chaque clic d'onglet renvoyait toute la conversation au serveur.** Mesuré en production le 2026-10-11 par la
session d'assurance qualité : ~490 Ko par clic, deux envois, 32 `PUT /ide-state` sur un projet neuf sans une seule
écriture.

Cause (lue dans le code, reproduite en test) : un changement d'onglet déclenche deux sauvegardes d'interface — la
disposition de l'IDE (`BaseChat.tsx`, effet à 1 s) et celle de l'aperçu (`Preview.tsx`, à 0,4 s). Chacune passait
par `saveProjectIdeMemory`, qui envoyait la mémoire ENTIÈRE, fil compris (`memoryForServerSave` rendait tout). Le
défaut vit dans `app/lib/persistence/projectIdeMemory.ts`, pas dans `app/lib/stores/workbench.ts` (aucun envoi
`ide-state` n'en part).

## Correctif (branche `fix/onglet-sans-renvoi-de-conversation`)

Le serveur fusionne (`mergeProjectIdeState`) : un `chat` absent garde le fil enregistré, un `files` absent garde le
manifeste, une clé d'`ui` absente garde sa valeur. Le client n'envoie donc plus que les clés de premier niveau
modifiées depuis le dernier envoi accepté, avec leur valeur complète (un fil touché part entier, comme avant). Les
clés d'un envoi échoué restent dues et repartent avec le suivant. Un envoi identique au dernier accepté n'est pas
refait.

**Non touchés** : la marque d'écriture réelle, la rematérialisation de `PUT /ide-state` (serveur inchangé). **Ne
touche pas `services/api/src/app.ts`.**

Épinglé par `app/lib/persistence/onglet-sans-renvoi-de-conversation.spec.ts` : sur `main`, **1 155 951 octets pour
un clic** (deux envois avec le fil) et un renvoi à l'identique ; après, quelques centaines d'octets, aucun fil, rien
de renvoyé. Contre-épreuve : sans le cumul des clés dues, le fil d'un envoi échoué est abandonné → rouge. 58 fichiers
voisins (persistance, stores, chat) verts.

## Doublon à ne pas livrer en plus

La branche `fix/reprise-persistance-onglets-20261011` (`22ad8d0b9`, autre session, aucune proposition) corrige la
même chose dans le même fichier. Vérifié dans les deux sens : ses 4 tests passent sur ce correctif, et les 6 tests
de ce correctif passent sur le sien — les deux implémentations sont équivalentes (tous les appelants ne sauvegardent
que `ui` et `chat`). Son test `projectIdeMemory.onglets.spec.ts` est repris ici, tel quel, pour que la garde soit
complète (10 cas). Livrer les deux ferait entrer en conflit deux réécritures du même code : **une seule**.

## Reste à vérifier

En production, avec une session : lequel des deux envois par clic subsiste (ils sont désormais de quelques
centaines d'octets chacun ; le second n'est plus renvoyé s'il est identique).
