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

## Preuves précédentes 01754106 : 63 tests, plus 6 gardes Security de la base intégrée

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

## Complément : nouveau BFF face à une ancienne API

Le rollout ne garantit pas davantage l’atomicité BFF/API. L’API historique c988c2af retire background et operationId de son schéma de commande, puis exécute la commande synchrone. Une vérification après la réponse serait trop tardive.

Le BFF utilise désormais exclusivement `/api/runtime/workspaces/:workspaceId/sessions/v1/start`. Ce chemin absent de l’ancienne API refuse avant exécution. La nouvelle API valide le contrat de session puis appelle le même handler, avec toutes ses vérifications d’autorisation, révocation, anti-abus et compatibilité agent. `/commands` conserve son comportement ; aucun fallback vers ce chemin n’est ajouté au BFF.

Contre-épreuve sur le vrai code API historique, PostgreSQL/RBAC et agent locaux : l’ancien payload crée effectivement un fichier marqueur synthétique. Après retrait de ce seul marqueur de fixture, le nouveau BFF reçoit un refus sur la route versionnée ; zéro POST `/commands`, aucun marqueur créé, aucun état running. Le BFF garde actuellement son erreur générique de lancement non confirmé pour cette ancienne API : l’expérience d’explication n’est pas une certification navigateur. Aucun shell utilisateur ni donnée de production touché.

Validation de ce delta : **14 BFF + 13 API + 8 parcours locaux = 35 tests distincts réussis**. Les sept parcours précédents passent au premier lancement ; le nouveau scénario échoue d’abord avant son exécution, car execFileSync limite la taille du code historique lu depuis Git (ENOBUFS). La lecture est explicitement bornée à 8 Mio ; seul ce scénario est ensuite rejoué et passe (les 7 autres sont non sélectionnés dans ce second run). Le rouge de préparation reste privé et n’est pas une panne produit. Les 29 autres tests du lot, les 6 Security et 6 inventaire conservent leurs preuves précédentes et ne sont pas répétés localement. Aucun délai/assertion/retry n’est affaibli.

Le build 01754106 reste historique, pas une validation du nouveau chemin BFF. Conformément au périmètre borné, seuls ces tests et les hooks obligatoires sont rejoués ; la nouvelle CI doit valider l’arbre publié. `receipt-01754106-historical.json` conserve la provenance antérieure.

## Correction CI de e65727dd : deux gardes i18n

Le job Install, test, build, scan **120478935226** échoue à l’étape Unit tests : `runtime-glossary.spec.ts` détecte deux textes français contenant « runtime », et `base-chat-ast.spec.ts` détecte l’appel direct toLocaleString ajouté pour l’échéance. Le contrôle i18n source, le lint et le typage précédents avaient réussi ; ils ne remplaçaient pas ces tests unitaires. Les étapes Integration tests et Build web/services sont ensuite skipped, pas vertes.

Le job Quality Gates **120478505664** échoue par propagation explicite `Required checks failed: Install, test, build, scan: failure`, après les deux CodeQL terminés. Ce n’est ni un timeout du gate ni une seconde panne indépendante. Aucune modification du workflow nécessaire.

Contre-épreuve locale sur e65727dd : **2 échecs et 6 succès** dans les deux fichiers concernés, mêmes assertions que la CI. Après remplacement des deux termes français et usage du formateur partagé formatBaseChatAstDateTime (avec repli traduit pour une date invalide) : **8/8 succès**, sans retry. `pnpm run i18n:check` passe également. Tests, assertions, seuils et exemptions inchangés. Les hooks normaux sont exécutés avant publication ; aucune suite globale locale répétée. La nouvelle CI doit encore valider son arbre exact.

## Correction CI de 1e975d2f : répertoire des fixtures agent

Le job **120497413763** dépasse les gardes i18n corrigées, puis échoue dans les tests du service workspace-agent : **6 échecs, 127 succès, 12 fichiers**. Premier échec : ENOENT au spawn Node ; les six scénarios concernés construisaient leur agent sans workspaceRoot et héritaient de `/workspace`. Le premier test avec répertoire temporaire explicite réussissait. Node existe ; un cwd absent produit aussi ENOENT au spawn. Les assertions suivantes (registre vide, état failed au lieu de timeout) sont des conséquences, pas des raisons de relever les délais. **Quality Gates 120497412285** propage l’échec Install, test, build, scan, sans timeout indépendant.

Contre-épreuve locale avant correction : WORKSPACE_ROOT désigne un chemin temporaire vérifié absent, sans supprimer ni modifier `/workspace`. Les mêmes six tests échouent, six autres réussissent. Après correction, chaque agent de ce fichier reçoit son propre mkdtemp explicite, nettoyé par afterEach après fermeture ; l’agent de production et sa valeur par défaut ne changent pas.

Validation complète du sous-ensemble CI concerné, avec le défaut de répertoire par défaut toujours simulé : `pnpm --dir services/workspace-agent test` → **12 fichiers, 133/133 succès, zéro omission/retry**. Cela inclut les 52 cas auparavant non sélectionnés, les processus réels et les tests streamés. Aucune assertion, borne, attente ou exemption modifiée. Les hooks normaux sont rejoués avant publication. Pas de suite globale du monorepo répétée ; CI du nouveau SHA toujours nécessaire.
