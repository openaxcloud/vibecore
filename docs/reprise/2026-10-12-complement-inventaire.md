# Complément de l'inventaire et priorités de reprise

## Périmètre et provenance

Complément documentaire du 12 octobre 2026, basé sur main `7ce2aa9ceac014b2449d053e3991baeaea9f427d`. L'[inventaire initial](2026-10-11-inventaire.md) conserve intégralement ses 71 entrées A/B. La source initiale y est datée du 11 octobre à 14:45 UTC ; les compléments utilisateur de 17:45 UTC et les priorités ultérieures sont conservés ici. Cette date de source n'est pas une date de validation des fonctionnalités.

Les points ci-dessous décrivent le périmètre et la preuve encore requise, sans remplacer les quatre registres canoniques accessibles depuis [PROBLEMES.md](../../PROBLEMES.md). Une ancienne mesure, une branche préparée ou une fusion ne prouve pas le comportement actuellement servi.

## Compléments A et B

| Point | Périmètre à conserver | Vérification attendue |
|---|---|---|
| A-36 | Retrait de `runtime-test`, `theme-validation`, `/marketing/bounties` et `bounties` | Vérifier leur retrait effectif dans les routes, liens et surfaces servies ; absence actuelle non établie par ce complément. |
| A-37 / D | Générer puis publier une application neuve de bout en bout | Rejouer une génération fraîche, compilation, aperçu, publication et fonctionnement réel de l'URL publiée. Les sept échecs TypeScript historiques ne prouvent ni un échec ni une réussite aujourd'hui. |
| B-4bis | Porte de qualité annulée | Une exécution annulée est sans résultat, jamais verte. Attendre le verdict d'une nouvelle tentative au SHA exact et l'agrégateur correspondant ; ne pas annuler un travail en cours. |

## C — Couverture visuelle et parcours

| Point | Périmètre à préserver | Preuve requise, non acquise ici |
|---|---|---|
| C-1 | Thème sombre des pages publiques | Audit réel du rendu public sombre, avec pages et version servie identifiées. |
| C-2 | Tablette 768 px, disposition deux volets | Vérifier le comportement attendu et l'usage réel à 768 px ; les anciens constats de coque compacte ne closent pas cette demande. |
| C-3 | Chacun des 29 panneaux et chacun de leurs boutons | Parcourir tous les panneaux au bureau et à 390 px, chaque bouton et états chargement/erreur/retour ; quatre panneaux anciennement testés ne représentent pas 29. |
| C-4 | Les 48 routes authentifiées | Matrice nominative, authentification réelle et preuve par route, avec erreurs, retour et parcours interrompus. |
| C-5 | Les 13 pages publiques hors audit | Identifier puis vérifier toutes les pages exclues de l'ancien audit ; ne pas extrapoler le verdict d'un sous-ensemble. |
| C-6 | WebKit et iOS physique | Conserver deux preuves distinctes : moteur WebKit automatisé et Safari sur appareil iOS physique. Un vert Chromium ou WebKitGTK ne vaut pas preuve iPhone. |

## D — Application neuve réellement publiée

Le point D est le même objectif de bout en bout qu'A-37, sans créer un statut concurrent. Conserver la provenance du prompt de test, l'identité de l'application de test, le SHA et la livraison servis, les résultats de build, l'URL publiée et l'interaction centrale réellement exercée. Documenter distinctement un blocage d'accès, une erreur du produit et une étape jamais exécutée. Aucun runtime ni parcours payant n'a été invoqué pour cette préparation documentaire.

## E — Produit, données et concurrence

| Point | Périmètre à préserver | Critère de vérification |
|---|---|---|
| E-1 | Désinscription newsletter effective | Vérifier l'effet réel de la désinscription et l'absence d'envoi ultérieur ; fiche existante [BUG-MKT-014](../bugs/BUG-MKT-014.md). Une réponse HTTP seule ne suffit pas. |
| E-2 | Choix du devenir de l'application gratuite après 30 jours | Clarifier le choix produit, son information à l'utilisateur et son application réelle ; ne pas inventer de décision ou d'autorisation de suppression. |
| E-3 | Un seul projet gratuit publié | Vérifier l'application effective de la limite, y compris deux publications concurrentes, sans paiement client. |
| E-4 | Purge physique réelle | Suivre A-6 et ses réserves GCS/PVC, rétention et preuve physique ; ne pas confondre marquage logique et destruction. Aucune suppression permanente autorisée par ce document. |
| E-5 | #708 : démarrage contre état RUNNING périmé, collisions | Distinguer le démarrage réel du tour d'un état RUNNING devenu périmé ; mesurer les collisions sur une journée complète, avec horodatages et cas concurrents. L'existence de [#708](https://github.com/openaxcloud/vibecore/pull/708) ne tranche pas cette opposition. |

## F — Observations historiques du Mac, hors accès actuel

Ces six points viennent d'observations anciennes sur le Mac ; ils ne décrivent pas l'état actuel de GitHub ni un accès disponible. Le périmètre actuel demandé est GitHub uniquement. Ils sont conservés pour éviter la perte de contexte, sans inspection du Mac ni permission de nettoyage.

| Point | Observation historique à préserver | Limite actuelle |
|---|---|---|
| F-1 | Plus de 180 fichiers modifiés et environ 20 autres fichiers non commités | Comptages historiques, non remesurés ; préserver le travail. |
| F-2 | Six branches de récupération/sauvegarde/historique | Leur présence et contenu actuels ne sont pas vérifiés ; aucune suppression ni fusion aveugle. |
| F-3 | Fusion interrompue | État local ancien à reconstater avant toute reprise ; ne pas supposer un conflit actuel sur GitHub. |
| F-4 | Cinq stashes partagés | Contenu et propriétaires non inspectés ; ne pas vider les stashes. |
| F-5 | Worktrees | État et travaux locaux inconnus aujourd'hui ; aucune suppression. |
| F-6 | Synchronisation | Alignement local/distant non établi ; aucune réinitialisation forcée ni perte de travail. |

## Priorités P0 à P4

1. **P0 — protection des fichiers d'audit.** Le contenu exact de `infra/terraform/envs/audit-test/.gitignore`, blob Git `05f3b821b509733957789d64f7701b73dd82aa47`, est déjà sur main via [10dbba89bc2966baf1d8a55d0b65c8765a6c4c98](https://github.com/openaxcloud/vibecore/commit/10dbba89bc2966baf1d8a55d0b65c8765a6c4c98). La branche historique identifiée par af14 n'est pas ancêtre de main, mais ce contenu est identique : ne pas la fusionner pour réappliquer ce correctif. Quatre chemins factices ont été contrôlés avec le vrai `git check-ignore` dans un dépôt isolé : deux sous `credentials/` (ligne 7), `terraform.tfstate` (ligne 3), `terraform.tfstate.*` (ligne 4). Aucun contenu secret n'a été lu. Ce contrôle d'ignorance ne démontre pas qu'aucun secret n'a jamais été publié ; une telle affirmation exigerait une preuve sur l'historique complet.
2. **P1 — #559 et contraste.** Les correctifs d’actualisation des fichiers et de partage pendant le chargement sont intégrés à main par [#714](https://github.com/openaxcloud/vibecore/pull/714), selon A-16 ; chaque autre écart de [#559](https://github.com/openaxcloud/vibecore/pull/559) reste à comparer avant décision. Sur main `7ce2aa9`, les comptages de `--vc-run-stop-fg`, `--vc-cta-accent-foreground` et `var(--vc-ide-on-accent-action)` sont respectivement 3, 3 et 14 ; sur la tête ancienne de #559 `904ba56b4b4aafbdc8dc6996ebc7e3208514731a`, ils sont 0, 0 et 0. L'ancien comptage de sept occurrences n'est donc pas actuel. Ces gardes présentes dans le code ne prouvent pas le contraste visuel live. Vérifier le contraste et le comportement de la version actuelle plutôt que fusionner aveuglément l'ancienne branche.
3. **P2 — main et livraison séparés.** Exiger le manifeste de release, ses SHA/digests et la comparaison avec les imageIDs réellement exécutés ; un workflow vert, un tag ou des pods prêts seuls ne prouvent pas la version servie. Conserver les limites par service et le verdict live distinct.
4. **P3 — branches prêtes avant code neuf.** Examiner d'abord les correctifs existants, leur contenu face à main et leurs validations. Ne pas réintroduire du code obsolète ni annuler un correctif récent par une fusion ancienne.
5. **P4 — impact utilisateur.** Prioriser ensuite argent/facturation, risque de perte de données et parcours cassés, avec preuves proportionnées à leur impact.

## Garde-fous de la reprise

- Deux PR actives au maximum ; coordonner les sessions avant d'en activer une autre.
- Ne pas annuler une exécution en cours ; une annulation n'est pas une validation.
- Ne pas utiliser `git merge-tree` comme preuve de validation.
- Exiger les contrôles CI natifs au SHA exact, les protections du dépôt et les validations requises avant fusion.
- Ne jamais intégrer `fix/forfait-pro-cinq-places`, `fix/reouverture-garde-la-version-utilisateur` ou `fix/agent-interrompu-tour-jamais-parti`.
- Préserver menu mobile, IDE existant et remise annuelle de 20 %. Aucune suppression permanente.
- Au relevé du 12 octobre 2026 à 05:18 UTC, [#723](https://github.com/openaxcloud/vibecore/pull/723) reste en brouillon : les 48 erreurs lint ont une réparation locale prête, mais la CI reste en attente de validation. Aucun verdict validé ni fusion n'est revendiqué ; reconsulter GitHub avant toute décision.
- Consigner chaque fusion réelle dans [SERVI-POUR-LES-SESSIONS.md](../../SERVI-POUR-LES-SESSIONS.md), avec fichiers exacts et preuve séparée de livraison. Cette préparation documentaire ne réalise aucune fusion.
