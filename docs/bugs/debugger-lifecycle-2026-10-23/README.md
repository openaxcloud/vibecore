# #779 — correction du contrat de durée et de persistance

## Contre-épreuve conservée

La tête historique 9454a766 réutilisait le délai synchrone de runCommand : processus synthétique arrêté par SIGTERM après **30 036 ms**, malgré background=true. La CI 39962345313, job 120443232146, échouait auparavant au garde i18n (trois nouvelles occurrences API/agent). Les premiers 38 succès ciblés ne couvraient pas ce défaut de durée ; ils ne sont pas une validation de cette correction.

## Contrat actuel

- Les commandes synchrones conservent WORKSPACE_COMMAND_TIMEOUT_MS (30 s par défaut). Les sessions suivies utilisent WORKSPACE_STREAM_TIMEOUT_MS, la politique interactive existante (30 min par défaut), sans relever ni supprimer cette borne. SIGTERM à l’échéance, SIGKILL au plus tôt 5 s après selon le mécanisme existant ; l’UI affiche l’échéance et le délai de grâce.
- Identité UUID d’opération persistée **avant** lancement, limitée au workspace et au registre des processus. Les lancements et arrêts simultanés d’une même identité partagent leur opération en cours, sans dupliquer les enfants. Les garde-fous de capacité, sortie, commandes et autorisation restent en place.
- Résultat terminal explicite : stopped, exited, failed ou timeout, avec date, code de sortie et signal. Au plus 200 résultats par agent/workspace, accessibles pendant 30 min, puis purgés à la lecture/évincés à l’insertion. Ils ne comptent pas comme processus actifs. Un statut terminal déjà persisté reste historique après expiration du cache ; une session active non vérifiable est signalée unknown, pas réinventée comme arrêtée.
- Stop attend close. Un signal sans terminaison confirmée sous 5 s produit un échec explicite ; un résultat terminal connu permet un Stop idempotent. Une sortie naturelle n’est pas transformée en stopped.
- Si la sauvegarde post-lancement échoue, arrêt compensatoire vérifié. L’identité déjà enregistrée permet de retrouver une réponse incertaine ou une compensation non confirmée. Après échec de sauvegarde d’un Stop, le runtime conserve son résultat : la lecture affiche l’état réel et indique la divergence, puis l’action « Réconcilier le statut enregistré » retente la persistance sans relancer de processus. Aucun GET ne réécrit tout l’historique.
- Les codes machine utilisent le champ code ; les textes utilisateur sont FR/EN. Aucun ajout d’exemption i18n/gitleaks ou modification d’un contrôle.

## 53 tests ciblés réussis

| Groupe | Nombre | Nature et portée |
|---|---:|---|
| BFF / réconciliation | 26 | 14 callbacks BFF à upstream contrôlé + 12 tests de rapprochement d’identités. Comprend erreurs de persistance et compensation non confirmée. |
| Contrat API | 7 | Vrais handlers extraits par AST, autorisation/transport contrôlés. Ne certifie pas seul RBAC. |
| Agent | 10 | 8 cas avec enfants réellement exécutés ; 2 doubles pour signal/horloge. Double Stop concurrent, sortie naturelle pendant Stop, attente réelle de 5 s, processus synchrones et streamés, borne interactive existante testée avec une configuration locale courte. |
| Régressions agent existantes | 5 | Sélection des commandes bornées, cwd permis/interdit, normalisation shell et anti-abus. **52 autres cas non sélectionnés**, pas une suite globale verte. |
| Chaîne complète locale | 5 | BFF → API authentifiée/RBAC → PostgreSQL dédié → agent réel. Survie après 31 s, refus d’un propriétaire étranger, Stop/double Stop et persistance ; sorties immédiates 0/7 ; deux fautes SQL injectées sur la seule fixture, avec compensation, lecture de divergence et réconciliation persistée. |

La recette réelle utilise les services du dépôt, le manager local avec son store JSON de développement et sa vraie émission/vérification de jetons, et l’agent dans un répertoire temporaire. Aucun mock de transport, d’authentification ou de store PostgreSQL dans cette recette. Kubernetes n’est pas exercé : son exécutable est volontairement inexistant dans ce banc. Les deux fautes SQL sont injectées par des triggers limités à la ligne d’état du projet synthétique ; triggers/fonctions/séquences sont supprimés en finally. Cela prouve le chemin d’échec réel, pas une panne spontanée de PostgreSQL.

Commande reproductible, avec DATABASE_URL pointant exclusivement vers la base locale synthétique :

```sh
pnpm exec vitest run --config tests/runtime/debugger-session.vitest.config.ts
```

Le test ne contient aucun credential permanent ; les identités et jetons sont générés pour la fixture. Les journaux bruts restent privés, car ils peuvent contenir les détails des requêtes de recette. `receipt.json` ne contient que les verdicts et empreintes de sources en groupes hexadécimaux concaténables. Les tentatives de préparation échouées (config/import) sont conservées localement et exclues des résultats produit.

## Limites

Pas de recette navigateur visuelle de l’échéance/du bouton de réconciliation, ni certification Kubernetes/production. Le cache terminal est borné et en mémoire : après éviction ou redémarrage, une session non réconciliée peut rester invérifiable, explicitement unknown. Aucun faux terminal n’est fabriqué pour combler ce manque. Le registre local de commandes de secours n’est pas un backend de sessions background ; celles-ci exigent l’agent compatible. Le rollout doit livrer cet agent et l’API avec le BFF ; la compatibilité d’un nouveau lancement avec une ancienne image d’agent n’est pas certifiée.

Le debugger complet demeure absent : pas de pont Inspector/DAP, pile, variables ni breakpoints actifs. Aucune permission, ressource payante ou configuration de sécurité ajoutée. #778 n’est pas intégré ici ; son inventaire et son correctif Security restent distincts.
