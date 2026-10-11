---
id: BUG-AGENT-IGNORE-CONSIGNE-001
---

## Bug

**P0 — l'agent a écrit des fichiers alors que la consigne lui demandait explicitement de n'en écrire aucun.** Remonté par la session mobile le 2026-09-30.

C'est le même registre que la perte silencieuse de fichiers de `BUG-RUNTIME-ECRITURES-REFUSEES` : ce qui est atteint n'est pas une fonctionnalité, c'est **la confiance dans ce que fait l'outil**. Un agent qui écrit quand on lui dit de ne rien écrire est un agent dont aucune consigne n'est tenue pour sûre — et l'utilisateur n'a aucun moyen de le savoir avant de constater les dégâts.

## 📤 Dispatché

☑ 2026-09-30 — consigné par la session livraisons, à reprendre.

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**Non encore mesurée par cette session.** Ce qui est connu tient au signalement : la consigne interdisait toute écriture, des fichiers ont été écrits.

**Ce qu'il faudra établir avant de corriger**, dans cet ordre :

1. **Le chemin réel** — la consigne est-elle seulement absente du prompt système envoyé au modèle, ou bien présente et ignorée ? Les deux appellent des correctifs opposés : l'un se règle dans la construction du contexte, l'autre dans une garde côté exécution.
2. **Le témoin littéral** — quelle chaîne le code émet-il quand il refuse une écriture ? S'il n'en émet aucune, il n'y a rien à observer et c'est déjà une partie du défaut.
3. **La garde qui tient** — une consigne de ne rien écrire doit être une **barrière à l'exécution**, pas une phrase dans un prompt. Un modèle ne garantit rien ; `ActionRunner` peut refuser.

⚠️ Ne pas corriger par un ajout de consigne dans le prompt : ce serait traiter le symptôme par le mécanisme même qui a échoué.
