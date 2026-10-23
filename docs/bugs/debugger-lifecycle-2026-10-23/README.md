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

## 63 tests ciblés réussis, plus 6 gardes Security de la base intégrée

| Groupe | Nombre | Nature et portée |
|---|---:|---|
| BFF / réconciliation | 26 | 14 callbacks BFF à upstream contrôlé + 12 tests de rapprochement d’identités. Comprend erreurs de persistance et compensation non confirmée. |
| Contrat API | 13 | Vrais handlers extraits par AST, autorisation/transport contrôlés. Ne certifie pas seul RBAC. |
| Agent | 12 | 8 cas avec enfants réellement exécutés ; 2 doubles pour signal/horloge et 2 contrôles authentification/validation du protocole. Double Stop concurrent, sortie naturelle pendant Stop, attente réelle de 5 s, processus synchrones et streamés, borne interactive existante testée avec une configuration locale courte. |
| Régressions agent existantes | 5 | Sélection des commandes bornées, cwd permis/interdit, normalisation shell et anti-abus. **52 autres cas non sélectionnés**, pas une suite globale verte. |
| Chaîne complète locale | 7 | BFF → API authentifiée/RBAC → PostgreSQL dédié → agent réel. Survie après 31 s, refus d’un propriétaire étranger, Stop/double Stop et persistance ; sorties immédiates 0/7 ; deux fautes SQL injectées sur la seule fixture, avec compensation, lecture de divergence et réconciliation persistée. |

Les deux cas supplémentaires de la chaîne locale chargent le vrai code agent historique `c988c2af` depuis Git (cet objet doit être disponible). Sans capacité, refus 503 avant tout POST de commande, état failed persisté. Avec une annonce de capacité volontairement périmée, le vrai ancien routeur refuse le POST versionné : aucun appel `/commands/run`, aucun fichier marqueur créé. Cette seconde annonce est injectée pour contrôler la course ; elle ne constitue pas un rollout Kubernetes réel.

La recette réelle invoque les handlers BFF avec des objets Request (pas de serveur HTTP BFF ni navigateur), puis utilise les services du dépôt, le manager local avec son store JSON de développement et sa vraie émission/vérification de jetons, et l’agent dans un répertoire temporaire. Aucun mock de transport, d’authentification ou de store PostgreSQL dans cette recette. Kubernetes n’est pas exercé : son exécutable est volontairement inexistant dans ce banc. Les deux fautes SQL sont injectées par des triggers limités à la ligne d’état du projet synthétique ; triggers/fonctions/séquences sont supprimés en finally. Cela prouve le chemin d’échec réel, pas une panne spontanée de PostgreSQL.

Commande reproductible, avec DATABASE_URL pointant exclusivement vers la base locale synthétique :

```sh
pnpm exec vitest run --config tests/runtime/debugger-session.vitest.config.ts
```

Le test ne contient aucun credential permanent ; les identités et jetons sont générés pour la fixture. Les journaux bruts restent privés, car ils peuvent contenir les détails des requêtes de recette. `receipt.json` ne contient que les verdicts et empreintes de sources en groupes hexadécimaux concaténables. Les tentatives de préparation échouées (config/import) sont conservées localement et exclues des résultats produit.

## Limites

Pas de recette navigateur visuelle de l’échéance/du bouton de réconciliation, ni certification Kubernetes/production. Le cache terminal est borné et en mémoire : après éviction ou redémarrage, une session non réconciliée peut rester invérifiable, explicitement unknown. Aucun faux terminal n’est fabriqué pour combler ce manque. Le registre local de commandes de secours n’est pas un backend de sessions background ; celles-ci exigent l’agent compatible. Le workflow `.github/workflows/deploy-main.yml` distingue explicitement workspace-agent (`rolled=false`) des déploiements contrôlés par imageIDs. Les pods d’agents existants ne sont pas remplacés atomiquement par Helm : le workflow déploie une référence d’image utilisée par le manager lors des créations. Le nouveau backend vérifie donc une capacité authentifiée `trackedSessions: 1`, après les gardes d’appartenance et d’autorisation, puis utilise exclusivement `/sessions/v1/start`. Un ancien agent échoue avant lancement ; si l’agent change après la lecture de capacité, ce chemin versionné absent échoue sans lancer ni retomber sur `/commands/run`. Les commandes synchrones restent sur leur chemin historique. Aucune modification de déploiement ou de permission.

Le debugger complet demeure absent : pas de pont Inspector/DAP, pile, variables ni breakpoints actifs. Aucune permission, ressource payante ou configuration de sécurité ajoutée. Main `fc41f1f0a8e709f070c5def90688486fbe43d7ad`, incluant #778, est intégré sans retouche des gardes Security ; ses 6 tests ciblés sont rejoués. L’inventaire conserve les 483 fiches en union. Le blob d’état reste exposé aux mises à jour concurrentes read-modify-write : ce lot ne prétend pas résoudre cette réserve indépendante.

Le premier hook de cette combinaison a bloqué sur le typage du JSON d’erreur (`unknown`/`{}`). L’assertion de type ajoutée est sans effet runtime : sortie JavaScript TypeScript strictement identique avant/après, contrôlée localement. Le build et la recette ci-dessus portent donc le même comportement émis ; les hooks complets sont rejoués sans contournement.
