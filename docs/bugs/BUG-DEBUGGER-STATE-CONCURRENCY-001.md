---
id: BUG-DEBUGGER-STATE-CONCURRENCY-001
---

# Débogueur : sauvegardes concurrentes sans écrasement silencieux

## Bug

**Deux opérations lisent le même état puis remplacent le blob entier : un historique/configuration peut disparaître malgré deux réponses de succès.** Reproduit localement sur main 6d306a5f avec deux vrais callbacks de sauvegarde du panneau, HTTP/API authentifiée, RBAC et PostgreSQL dédiés. Un proxy ne retient que la livraison des deux lectures réelles pour imposer la collision ; il ne simule ni réponse ni base. L’assertion « toute sauvegarde acceptée doit être présente » devient rouge.

## 📤 Dispatché

Préparation locale autorisée le 23 octobre, branche distincte `fix/debugger-state-cas-local`, sans projet utilisateur, nouvelle permission ni infrastructure. Pas de publication demandée à cette étape.

## 💻 Codé

Correctif local, pas livré. La route versionnée `/projects/:projectId/debugger-state/v1` exige la valeur précédemment lue (null pour une première création). PostgreSQL compare/écrit dans une transaction : création protégée par la contrainte unique existante ; remplacement conditionnel sur projet/clé/portée/valeur. Une répétition au contenu identique est reconnue ; un autre état reçoit 409 DEBUG_STATE_CONFLICT et ne peut pas écraser le gagnant. Aucune fusion implicite de blobs périmés, aucune migration.

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
