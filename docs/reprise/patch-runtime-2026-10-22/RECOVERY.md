# Reprise ciblée de #765 — 22 octobre 2026

Branche : `codex/jsonc-verified-apply-recovery`. Départ : `540cb88ed3c404df16731e53eb897a52fab5a7d4` ; base historique : `18cf74fd7abcd59620f0994b44ac1411e97fcf93`. Main intégré : `18745bd04f77e4d9fc6353d61bd4d17a3822f94e`, merge local `872343f21`. #765 reste intacte, aucun force-push. #764 n’est ni intégrée ni fusionnée.

## Revue de fusion et corrections CI

- Seul conflit explicite : `BUG_INVENTORY_LIVE.md`, régénéré depuis `docs/bugs/` (472 entrées), en conservant les deux lots.
- BaseChat : extraction de la file de revue conservée ; identité des documents par panneau, opérations ciblées, focus et navigation de #763 conservés.
- Workbench : retour du contenu réellement sauvegardé et confirmation des propositions conservés avec les opérations documentaires de #763. Pas de seconde écriture obsolète.
- Les manifestes de main et #765 ne divergeaient pas. La reprise ajoute seulement `@vibecore/workspace-agent: workspace:*` aux devDependencies racine et le lien local correspondant au lockfile. Cela rend l’import du test disque résoluble après installation figée, sans alias absolu ni exception de lint.
- Le test de câblage vérifie désormais l’import/rendu du composant depuis BaseChat ainsi que l’appel de `propositionsAMontrer` dans AgentPatchReviewQueue ; la condition de rendu reste contrôlée dans BaseChat.
- Les deux messages `applied via` du fallback deviennent `validated via …; awaiting write confirmation`. La validation du contenu ne prétend plus confirmer son écriture.

## Portée des preuves

Le test `agent-file-write.integration.spec.ts` appelle le vrai workspace-agent local via Fastify inject, écrit dans un répertoire temporaire, relit les octets via l’agent et directement sur disque, vérifie toutes les options après commentaires JSONC, puis simule une modification concurrente sur disque. La confirmation doit alors échouer sans seconde écriture. Il ne traverse ni réseau HTTP réel, ni gateway API, ni Kubernetes.

Les autres tests store/DOM utilisent des doubles de runtime ou jsdom. Ils couvrent notamment les changements de workspace, le contenu réconcilié, le refus de succès avant confirmation, le blocage du démarrage et les conflits visibles. Ils ne prouvent pas une génération fournisseur ni une recette navigateur du produit déployé.

Aucune écriture dans le projet utilisateur ni création de ressource distante. La restauration de 20 sources et les 29 fichiers concordants sont des observations rapportées par le navigateur, pas une réparation effectuée ici. Les 12 composants manquants et la preuve durable d’export restent hors de ce correctif.

La relecture confirme un contenu à un instant donné ; elle ne fournit pas de comparaison atomique inter-client. Le diagnostic utilisateur classe les erreurs sans texte arbitraire, mais `files.ts` conserve son `logger.error` brut préexistant. Aucun engagement d’expurgation globale des logs.

## Validation de la reprise

État au moment de la publication du brouillon : tests ciblés **126/126** ; installation figée pnpm 9.14.4, lint (0 erreur, 52 avertissements préexistants), i18n, typage complet, builds web client+SSR/admin/services, contrôles du chemin critique, no-runtime-mocks et production self-test verts. Suites de services : **3 177 tests passés, 187 sauts conditionnels existants**. Les portes PostgreSQL dédiées de CI et la recette navigateur restent nécessaires.

La suite racine complète n’est **pas encore verte** au moment de cette publication. Premier passage : **10 004 passés, 1 échec offline, 7 sauts existants** ; le store préparé corrige ce test inchangé. Second passage, deux fichiers en parallèle : **9 999 passés, 7 sauts**, échec de collecte des six tests `touch-floor-rem-base.spec.ts` dans l’IPC de `sass-embedded` (`Expected 0 to equal 2`). Ces six tests passent isolément et dans la troisième exécution séquentielle en cours. Aucun correctif produit Sass, changement de délai, suppression ou exemption de test n’est revendiqué. Les échecs sont conservés dans les journaux locaux ; `recovery-manifest.json` contient des résumés expurgés, commandes et empreintes. Le résultat final exact sera communiqué dans la PR ; celle-ci reste en brouillon et ne doit pas être fusionnée avant CI et revue indépendante.

Validation locale sous Node 24.19.0 ; la CI utilise Node 22. Les anciens manifestes restent historiques. Les 29 empreintes des sources et manifestes de dépendances sont inchangées depuis les validations.

## Action officielle et preuve de persistance — lecture du code uniquement

Aucune action UI existante ne fournit une transaction additive avec préconditions qui garantit simultanément le contenu exact d’un lot préparé dans le runtime et dans son export. Upload et New File ne sont pas proposés comme solution de remplacement. Aucun accès ni écriture au projet utilisateur n’a été effectué pour cette analyse.

- **Enregistrer un fichier déjà ouvert** : `BaseChat.saveProjectEditorFile` appelle `workbenchStore.saveFile` ([BaseChat](../../../app/components/chat/BaseChat.tsx#L6543), [workbench](../../../app/lib/stores/workbench.ts#L2454)). Le runtime distant passe par `PUT /api/runtime/workspaces/:workspaceId/files/write` ([adaptateur](../../../packages/runtime-remote/src/index.ts#L575)). L’API écrit dans le runtime puis tente `persistProjectFileEntry`, qui met à jour le manifeste persistant. Mais son exception est journalisée et la route retourne quand même 204 ([API](../../../services/api/src/app.ts#L18957)). De plus, `mutateProjectFileManifestEntries` retourne sans mutation si aucun manifeste explicite n’existe ([API](../../../services/api/src/app.ts#L5152)). Un succès d’enregistrement ne prouve donc pas la persistance du manifeste. Ces deux défauts sont réservés au lot API séparé ; ils ne sont pas corrigés ici. La sauvegarde manuelle n’acquiert pas, dans ce lot, la relecture de confirmation réservée aux propositions.
- **Accepter une proposition** : le correctif relit le contenu réellement sauvegardé avant `accepted`, `file:applied` et historique ([workbench](../../../app/lib/stores/workbench.ts#L2938)). Ce contenu peut avoir été réconcilié/sanitisé : il faut le comparer au contenu attendu pour une réparation exacte. Le checkpoint ultérieur peut échouer sans annuler l’acceptation. Ni la relecture runtime ni l’historique ne prouvent l’export.
- **Exporter le projet** : le bouton existant télécharge le ZIP via `project-action?intent=export` ([route UI](../../../app/routes/api.projects.$projectId.project-action.ts#L11)). L’API matérialise le manifeste persistant dans ProjectStorage lorsqu’il existe, puis construit le ZIP ; elle ne relit pas directement le pod ([matérialisation](../../../services/api/src/app.ts#L5371), [export](../../../services/api/src/app.ts#L25049)). Elle attend aussi `putProjectStorageObject`, qui enregistre l’archive et son SHA256 dans le store ([persistance d’archive](../../../services/api/src/app.ts#L17889)). Ce GET n’est donc pas une lecture sans effet : il peut matérialiser le stockage et enregistrer une archive.

Pour la recette future, il faut deux comparaisons distinctes avec la copie approuvée : chemins et SHA256 des fichiers relus dans le runtime, puis chemins et SHA256 des entrées du ZIP effectivement téléchargé. Un ZIP correspondant prouve les octets exportés à ce moment, pas une synchronisation atomique permanente entre clients. Le succès runtime seul, l’absence d’erreur UI, un snapshot demandé ou le démarrage de Vite ne suffisent pas. La durabilité effective après redémarrage/réouverture doit être vérifiée séparément dans l’environnement déployé. Le remplacement ZIP automatique de fin d’artefact utilise `replaceExisting: true` et intercepte ses erreurs ; il ne constitue pas l’import additif sûr recherché ([workbench](../../../app/lib/stores/workbench.ts#L4381)).

## Coordination avec le lot API #766 — sans intégration

#766 (`5a0602814`, base `18745bd0`) est signalée par le parent comme corrigeant les faux succès de persistance côté API. Cette branche ne l’intègre pas et ne prétend pas avoir validé l’arbre combiné.

Le client courant peut encore **éviter entièrement** cette route : [RemoteRuntimeAdapter.writeFile](../../../packages/runtime-remote/src/index.ts#L575) retourne immédiatement si `#lastWrittenContent.get(path) === content`, avant de regarder `options.streaming`. Le cache est alimenté après toute réponse considérée réussie, y compris une écriture de flux ou un ancien 204 dont la persistance était défaillante. Une sauvegarde hors flux identique ne provoque alors aucune requête. La relecture runtime des propositions peut passer malgré ce manifeste périmé : ce lot JSONC ne ferme pas cette lacune.

Complément client minimal à traiter séparément : ne dédupliquer que les écritures de flux ; toujours envoyer une écriture hors flux, même si le contenu égale le cache existant. Prévoir les tests flux→sauvegarde identique, ancien succès en cache→sauvegarde identique, échec de persistance→nouvelle tentative, et maintien de la déduplication de fragments de flux. Aucun changement de `runtime-remote` ni nouvelle fonctionnalité n’a été ajouté ici. La combinaison devra être validée avec la tête API revue, sans prétendre fournir une comparaison atomique inter-client.
