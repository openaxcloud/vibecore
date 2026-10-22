# Portée des fichiers entre projets — preuves locales

Correctif compilé `2023932ed96228ea1fe970af441ecff8b009736a`, arbre `67bd1de53ff174cd07359bc6aa61168fcf96e387`. Build terminé avec code 0 selon le responsable du banc. La recette navigateur termine avec quatre succès directs, zéro retry/omission ; l’attestation complète est disponible. Lot non intégré à main.

## Rouge établi

Base source `e4bda1fbbeefb3988689fc864927edbc4f171cfd`, build local servi `838684f007255fb0f91177f5e1598940ad084fca`, produit équivalent selon la provenance du banc parent. API locale 3017, application 5226, données synthétiques. Le nouveau test suivi « project A never displays project B while its archive is pending at 768 » échoue directement en 22,399 s ; durée totale du rapport 24,370 s, zéro retry/omission.

Après Back de B vers A, la vraie archive A est temporairement retenue sans remplacer sa réponse. La route et l’URL sont celles de A, mais README.md affiche encore le marqueur synthétique `# Selection project B`. L’assertion exige zéro contenu B pendant cette attente et échoue. La capture inspectée montre ce contenu incorrect ; elle ne montre pas à elle seule l’URL ou l’état du routeur. Ces derniers proviennent du diagnostic instrumenté conservé séparément.

## Mécanisme observé, distinct du flaky CI

Le diagnostic du singleton compilé constate les fichiers, documents et currentDocument de B conservés après `configureProject(undefined)` puis `configureProject(A)`. Lorsque l’adaptateur runtime est identique, `configureRuntime` retourne sans vider cette map. Restaurer le chemin README.md de A lit alors son homonyme dans la map B. La continuation de l’archive réelle HTTP 200 remplace ensuite les données par celles de A.

Les observateurs appellent les méthodes originales et ne fabriquent pas de réponse backend. Ils enregistrent des marqueurs synthétiques connus, pas des contenus arbitraires. Le problème est donc observé dans les stores et pas seulement dans l’affichage de l’éditeur. Le scénario CI spontané à 768 px passait localement : cette fenêtre incorrecte reproduite ne prouve pas la cause du timeout intermittent de CI, ni sa résolution.

## Correction et validations

Le lot parent corrige la propriété des fichiers dans workbench/files : un vrai changement de projet doit invalider les données en mémoire, indépendamment de l’identité du runtime ; un nettoyage puis remontage du même projet doit préserver son brouillon et sa sélection. Aucune suppression backend n’est visée.

Le dernier test unitaire local comporte 34 succès, zéro échec, en 4,67 s. Une erreur initiale liée aux liens Prisma du worktree, puis 34 erreurs de formatage/lint corrigées, sont conservées comme étapes de préparation rapportées par le parent : elles ne sont ni une preuve rouge du défaut produit ni des tests dispensés. Le build du correctif est terminé avec code 0. La recette compilée et l’attestation sont terminées, décrites ci-dessous.

## Expurgation

Seuls les compteurs, titres, durées, versions et empreintes sont repris. La capture contient uniquement le marqueur de fixture synthétique, sans identifiant de session, compte personnel ni secret. Rapports bruts, traces ZIP, cookies, tokens, identifiants de projets et réponses API sont exclus. Les SHA-256 relient les résumés aux preuves privées ; aucun résultat production, Safari, runtime fournisseur ou sauvegarde distante n’est revendiqué.

Les courses lors d’une interruption de chargement, les événements WebSocket tardifs et les écritures en cours ne sont pas certifiés par la seule reproduction d’une archive retenue. Les validations de ces chemins doivent être distinguées explicitement des gestes navigateur ci-dessous.

## Validation compilée terminée

Quatre succès directs, zéro échec, retry ou omission : retour B→A avec README provisoire à 390 et 768 px ; absence de contenu B pendant l’archive A retenue à 768 px ; navigation interrompue entre panneaux puis Back. Les titres, durées et compteurs exacts figurent dans `final-summary.json`. Ce dernier scénario est un contrôle de non-régression local et ne suffit pas à déclarer le flaky CI historique résolu.

Les deux captures finales inspectées montrent « No file selected » pendant l’archive retenue (aucun contenu B), puis TEMPORARY-README après continuation. Elles ne montrent que les marqueurs synthétiques de la fixture, sans compte, token ni identifiant privé. La capture rouge est conservée à côté pour comparaison.

Le reçu atteste 9 464 sources comparées aux blobs Git sans différence, 2 306 fichiers compilés et code de build 0. Les tableaux `sources.json` et `compiled.json` ne contiennent que chemins relatifs et empreintes. L’archive privée SHA-256 `e03c7fb246f1b4ff94a3903c0114a663baa619b7c6d848fc1e94a3fec286526d` n’est pas copiée ; `served-asset.json` relie un asset servi au contenu compilé. Application locale port 5228, API 3017 ; données synthétiques.

Ces reçus attestent un build et des gestes locaux, pas une CI ou une livraison en production. Les changements documentaires de ce dossier sont postérieurs au build et ne prétendent pas figurer dans son manifeste de sources.

## Portée et reproduction du banc

La fixture utilise les vraies API locales d’inscription, connexion, import et export avec PostgreSQL dédié. Elle interrompt les appels runtime/runtime-token/chat, les WebSockets et les écritures non-GET sur les fichiers ; les requêtes externes sont bloquées. Ces interruptions ne fabriquent pas de réponses réussies. La sauvegarde distante et le runtime fournisseur ne sont donc pas validés. Pendant l’archive retenue, l’éditeur indique « No file selected » ; cette capture ne certifie pas un état de chargement UX complet.

La configuration exacte `scope-green.config.ts.txt`, à recopier dans `.vibecore/ux-qa/scope-green.config.ts`, reproduit les quatre cas sur Chromium système, un worker et zéro retry. Elle étend la configuration suivie du dépôt ; les chemins de sortie doivent être adaptés à un répertoire local de preuves. Commande exécutée :

```sh
SAAS_API_URL=http://127.0.0.1:3017 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5228 pnpm exec playwright test --config .vibecore/ux-qa/scope-green.config.ts
```

## Suite unitaire complète : premier résultat conservé

La première exécution complète termine rouge : 1 300 fichiers réussis, une suite en échec de collecte et deux fichiers omis ; 10 021 tests réussis et sept omissions existantes. `tint-contrast-sweep.spec.ts` ne démarre pas ses cinq assertions : Sass échoue dans `SyncMessagePort.receiveMessage` (`0 !== 2`) pendant la compilation. La même suite isolée passe ensuite 5/5 sans modification. L’assertion relève du protocole IPC synchrone de Sass : réveil sans message ni indicateur de fermeture attendu. Aucun indice ne permet d’attribuer ce cas à une saturation CPU, une pénurie mémoire ou au correctif. La cause du sous-processus reste indéterminée ; ce succès isolé n’efface pas le rouge global. Une seconde exécution complète identique a été effectuée, sans modification de seuil, délai, retry ni exclusion de test suivi.

Pour ces commandes Vitest, les configurations privées de recette Playwright non suivies ont été déplacées temporairement hors du worktree puis restaurées ; aucun fichier de test suivi n’est exclu ou modifié. Les empreintes des journaux sont dans `full-unit-initial-summary.json`.

La seconde exécution complète termine avec 1 301 fichiers réussis et deux omis : 10 026 tests réussis, sept omissions existantes, zéro échec, en 318,63 s. Aucun changement de produit, test ou configuration entre les deux exécutions ; le premier rouge reste documenté. Ce résultat ne démontre pas la résolution de l’incident IPC Sass. Voir `full-unit-final-summary.json`.
