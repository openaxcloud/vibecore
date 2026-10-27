# Complément local après #807 — contrat des agents et reprises

Base : tête #807 `3d8059a3ad1fe8b540068ada09b5ed417ee0d169`. Ce complément est préparé sur une branche distincte ; il ne modifie pas cette tête en CI. Le dossier parent décrit #807 et ses limites à sa publication. Aucune fusion/livraison de ce complément.

## Observation production transmise par le parent

Le navigateur du parent dispose désormais d’une session authentifiée ; aucune session ni cookie transféré vers cet environnement de code. Sur une ouverture normale du portfolio : progression initiale76%, `preview.proxy.unreachable` sur5173, commande sortie1 et iframe `about:blank`, puis récupération automatique et rendu de la page. Conserver les deux étapes : ce n’est ni une panne permanente ni une reprise due à ces correctifs non déployés. Le projet peut être modifié par l’utilisateur en parallèle ; aucun edit effectué par le worker. SHA du frontend servi non extrait dans ce relevé.

L’historique réel transmis présente aussi des réponses de rôles vides, un consensus25% et une déclaration QA « Passed all tests ». La déclaration n’est pas une preuve d’exécution ; le backend corrige son contrat dans une autre session. Cette preuve authentifiée est distincte des fixtures ci-dessous. Le statut HTTP du GET de la vignette signalée reste attendu : le portfolio et cette carte sont deux projets distincts.

## Changements limités

- Consommer `consensus.consolidated.agreedVerificationClaims` uniquement si tableau intégral de chaînes. Présenter des déclarations non vérifiées, conserver les originaux. Ne jamais interpréter l’ancien `acceptedVerification` ou l’absence d’un champ comme preuve d’exécution.
- Conserver les champs optionnels de l’événement `agentLaneStream` de fin de voie sans dupliquer les interfaces partagées. Le résultat final reste prioritaire. Interruption explicite et états partiel/échec restent visibles même en cas de champs contradictoires ; fichiers émis ne signifie pas appliqués.
- Lors d’un redimensionnement compact, garder le bouton déjà focalisé dans le défilement des notifications : aucun appel focus(), aucun déplacement de page/fil ni remontage de queue. Ignorer le focus extérieur ; annuler observateur, écouteurs et RAF au démontage.
- Une notification informative de démarrage automatique par visite de projet. La factory reste stable pour ne pas relancer le boot par changement d’identité du callback ; la visite est capturée avant l’attente puis vérifiée après. Les tentatives, erreurs, timers, état runtime et relance manuelle sont inchangés. Une notification ne signifie jamais aperçu prêt.

Fichiers produit : `AssistantMessage.tsx`, `AgentLaneSummary.tsx`, catalogue `assistant-message.ts`, `useIdeToastLayout.ts`, `Preview.tsx` et nouveau `usePreviewStartNotice.ts`, avec leurs tests. Aucun backend, interface partagée, BaseChat, route IDE ou fichier de #799 modifié. Aucun nouveau mock produit.

## Preuves

- 137tests intégrés /16fichiers verts, incluant les nouveaux cas. Ce total inclut les suites de40tests Agents et les6tests focus ; ne pas les additionner.
- Vrai composant Agents :8cas FR/EN320/390/820/1440, clavier, détails des déclarations et stabilité pendant variations du texte/métadonnées. [Reçu](agents/receipt.json).
- Vrai hook React + vrai conteneur :10étapes clair/sombre390→844paysage→820→1440→390. Huit étapes compactes gardent le bouton visible ; les deux desktop restent hors réparation. Identité/focus conservés et pageY0 ; deux contrôles de focus extérieur inchangé. [Reçu](focus/receipt.json).
- Démarrage automatique : reproduction rouge sur le vrai Preview monté, deux démarrages/deux infos ; correctif, deux démarrages/une info. Échec502 préservé et reprise autorisée. Hook : visite A→B→A, résultats tardifs et démontage. [Preuves](start-notice/README.md).
- Complément zoom natif200% sur la tête #807 inchangée :20étapes, neuf largeurs CSS320–1920, clair/sombre, assets du build final. Ce reçu ne certifie pas le nouveau correctif focus. [Limites](zoom/README.md).

Les revues indépendantes de l’affichage, du focus et de la notification sont favorables dans leurs scopes. Lint app final :0erreur/52avertissements préexistants. Typage web réussi après intégration du hook de notification. Build groupé final client/SSR réussi. Les journaux et empreintes sont conservés dans ce dossier.

## Ce qui reste non prouvé

Recettes locales synthétiques, pas orchestration réelle ni preview5173 réparée. Pas de Safari matériel, lecteur d’écran ou clavier virtuel physique. Aucun reprovisionnement de stockage, aucune nouvelle capture cliente, aucune écriture de projet, publication, credential ou ressource payante. #799 conserve sa priorité ; publication de ce complément à coordonner avec le lot backend et la livraison précédente.
