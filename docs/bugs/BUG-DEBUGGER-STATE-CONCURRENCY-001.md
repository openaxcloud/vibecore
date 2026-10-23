---
id: BUG-DEBUGGER-STATE-CONCURRENCY-001
---

# Débogueur : sauvegardes concurrentes sans écrasement silencieux

## Bug

**Deux opérations lisent le même état puis remplacent le blob entier : un historique/configuration peut disparaître malgré deux réponses de succès.** Reproduit localement sur main 6d306a5f avec deux vrais callbacks de sauvegarde du panneau, HTTP/API authentifiée, RBAC et PostgreSQL dédiés. Un proxy ne retient que la livraison des deux lectures réelles pour imposer la collision ; il ne simule ni réponse ni base. L’assertion « toute sauvegarde acceptée doit être présente » devient rouge.

## 📤 Dispatché

Lot autorisé le 23 octobre, branche distincte `fix/debugger-state-cas-local`, publié en PR brouillon #780, sans projet utilisateur, nouvelle permission ni infrastructure.

## 💻 Codé

Correctif proposé en PR #780, pas livré. La route versionnée `/projects/:projectId/debugger-state/v1` exige la valeur précédemment lue (null pour une première création). PostgreSQL compare/écrit dans une transaction : création protégée par la contrainte unique existante ; remplacement conditionnel sur projet/clé/portée/valeur. Une répétition au contenu identique est reconnue ; un autre état reçoit 409 DEBUG_STATE_CONFLICT et ne peut pas écraser le gagnant. Aucune fusion implicite de blobs périmés, aucune migration.

Le BFF avance sa précondition seulement après une écriture confirmée. Un conflit avant lancement empêche le lancement ; après lancement, la compensation existante reste nécessaire. Une sauvegarde de configuration en conflit rend une erreur FR/EN sans faux succès ; relire puis répéter l’action conserve les deux configurations sans doublon. La liste globale de pass-through d’erreurs reste inchangée.

L’ancien PUT env-vars sans précondition est refusé pour cette seule clé interne sur la nouvelle API. Les variables ordinaires conservent leur contrat. La nouvelle route est absente des anciennes API : le nouveau BFF ne leur confie pas une écriture conditionnelle qu’elles pourraient ignorer. Un ancien BFF face à la nouvelle API doit être mis à jour pour sauvegarder ce panneau ; pas de fallback silencieux.

## ✅ Testé live

- Recette complète locale réelle : **11/11**, sans omission/retry. Inclut la contre-épreuve initiale rouge, puis collision de sauvegardes, conflit explicite, nouvelle lecture, répétition sans doublon, création concurrente, portée projet/RBAC et maintien des parcours de processus/compensation.
- BFF/erreurs partagées/glossaire : **33/33**, dépendances contrôlées lorsque signalé par les tests. La liste globale de pass-through reste inchangée ; ses gardes passent.
- API/scopes/store : **16 succès, 3 tests PostgreSQL existants non exécutés** faute de DATABASE_URL dans ce lancement contrôlé. Le banc réel distinct ci-dessus utilise effectivement PostgreSQL ; ces deux résultats ne sont pas confondus.
- Inventaire : **6/6**, union de 484 fiches. Contrôle i18n et build web passent. Les ajustements eslint sont uniquement formatage/accolades ; leur JavaScript normalisé esbuild est strictement identique.

Pas de recette navigateur/production, ni de validation d’un debugger complet. Reçu expurgé : [receipt.json](debugger-state-concurrency-2026-10-23/receipt.json). Les journaux bruts restent locaux et privés. Les échecs intermédiaires de propagation du conflit (502 puis code générique) et la garde de pass-through sont conservés ; le correctif final rend le 409 localement sans modifier cette garde.

## Limites

Une collision est refusée explicitement : ce lot ne fusionne pas automatiquement les intentions concurrentes. Les plafonds historiques des listes restent inchangés. Les codes déjà déployés avant cette correction peuvent toujours écrire sans condition sur une ancienne API ; aucun ordre de rollout atomique n’est revendiqué. Les modifications directes du stockage/restaurations hors de ce contrat ne sont pas couvertes. L’ancienne API est refusée avant l’écriture/lancement par le nouveau BFF.

## Complément de revue : arrêt confirmé puis conflit final

Sur la tête publiée a3f3a4b, la recette réelle supplémentaire confirme déjà : l’agent arrête le processus synthétique, une écriture concurrente réelle ajoute un historique, le CAS final refuse le blob périmé avec 409, puis une nouvelle lecture et la réconciliation enregistrent stopped sans second arrêt ni perte de cet historique. En revanche, la réponse 409 ne contient pas le statut confirmé : contre-épreuve rouge sur `result.session`. Le callback UI réel extrait avec transport contrôlé ne recharge pas ce cas : seconde contre-épreuve rouge.

Le complément transmet le statut confirmé avec `persistencePending: true`, garde HTTP 409 / ok:false et une explication FR/EN distinguant arrêt effectif et enregistrement refusé. Le panneau Debugger recharge alors sa vue sans annoncer une réussite ni réinitialiser le formulaire. Les conflits de configuration et les autres panneaux gardent leur comportement. La base peut temporairement contenir running après l’arrêt : cette divergence est signalée, et la réconciliation explicite après lecture courante la résout.

Validation locale du complément : **1 recette réelle passée, 11 autres cas non sélectionnés**, puis **28/28 tests ciblés** (BFF, callback UI contrôlé, glossaire et AST i18n). Le proxy injecte uniquement l’ordre de livraison : après le vrai arrêt, il effectue un vrai CAS concurrent avant de remettre la réponse à BFF. Aucun arrêt, état PostgreSQL ou résultat API n’est simulé dans cette recette. La première invocation avait une attente incorrecte sur un champ optionnel absent après réconciliation (false attendu) ; corrigée avant la contre-épreuve fonctionnelle, sans changement produit pour ce point. Pas de recette navigateur.

Les **3 tests PostgreSQL précédemment non sélectionnés ont ensuite passé 3/3** sur la base synthétique dédiée (6 tests hors sélection dans cette invocation), en 4,27 s. Ce complément porte la couverture API/store cumulée à 19 succès, sans assimiler les résultats locaux à la CI. La preuve historique initiale reste intacte ; résultat communiqué dans le commentaire PR 6372120860.
