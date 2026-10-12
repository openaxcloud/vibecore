# Complément local — modèles Monaco partagés, onglets épinglés et flottants

Base : deux commits locaux conservés sans réécriture, `464fbb5f05460ed4037af68adcd15fe814830386` (identité des onglets) et `6253a34e7c48fed2b413a68bb75e1bfb10c5371e` (document Monaco initial). Même branche `codex/audit-local-files-20261012`, aucune publication ni PR. Ce complément répond aux limites identifiées pendant leur relecture ; il ne vaut pas validation de production.

## Contre-épreuves

- Le double Monaco rejette désormais une deuxième création pour la même URI, comme Monaco réel. Sur la source du deuxième commit, les cas modèle préexistant et deux éditeurs du même fichier échouent avec `Cannot add model because it already exists`. Le test initial d'import retardé reste vert. Journal local : `models-before.log`.
- Une fois le partage permis, la contre-épreuve de mise à jour externe du contenu observe un `onChange` parasite dans le second éditeur : attendu zéro, reçu `{ source: 'monaco', value: 'EXTERNAL UPDATE' }`. Journal : `shared-notify-before.log`. Ce défaut supplémentaire a été signalé par la relecture indépendante puis démontré avant correction.
- Moteur d'onglets : une preview épinglée A est réutilisée pour B. Le test composant conserve l'exigence d'identité A. Le navigateur réel confirme : après épinglage de `audit.txt`, cliquer `other.txt` produit `Pinned tab: /other.txt`. Le test E2E durable échoue exactement après ce clic : attendu un onglet épinglé A, obtenu zéro. Journaux : `pinned-floating-counterproof.log`, `e2e-pinned-before.log`.
- Parcours réel scission → volet flottant → palette → ouvrir B → réancrer : l'onglet reste A alors que le chemin et le texte affichent B. Test E2E dédié rouge avant correction, attendu un onglet B dans le volet flottant, reçu zéro. Journal : `floating-e2e-before.log` ; capture `floating-before-docked.png` inspectée.

Les preuves temporaires sont sous `/tmp/review2-evidence/`, sauf le journal moteur sous `/tmp/`. Les tests commis sont la contre-épreuve durable et ne remplacent aucune réponse réseau par un succès fictif.

## Corrections bornées

Monaco réutilise les modèles par URI. Chaque composant retient ses modèles actifs et ceux de son index ; un compteur partagé conserve les modèles créés ici tant qu'un autre éditeur les retient. Un modèle externe emprunté n'est jamais détruit par ce code. Les modèles de l'index et des fournisseurs sémantiques utilisent la même acquisition. Le nettoyage du widget ne détruit plus inconditionnellement le modèle initial. La synchronisation externe marque le modèle pendant `setValue`, pour que tous les widgets attachés ignorent cette notification synthétique ; les modifications utilisateur continuent à notifier.

Le moteur ne réutilise plus une preview épinglée. `BaseChat.openWorkspacePanel` transmet les volets flottants au moteur et applique la mise à jour au propriétaire réel de la cible (arbre docké ou liste flottante). Les refs conservent l'identité du callback, afin de ne pas redéclencher l'effet d'ouverture depuis l'URL à chaque changement de disposition.

## Brouillon réel et limites

Dans le build précédant ce complément, un utilisateur synthétique saisit `UNSAVED-A-UNIQUE` dans A, ouvre B puis revient à A : texte et `currentDocument.value` restent exacts, `unsavedFiles` contient A. Aucune lecture HTTP de contenu pendant ce trajet ; seul un PUT d'état IDE est observé. Capture `draft-return-before.png` inspectée. Les écritures de fichiers sont bloquées dans le harnais ; une tentative d'autosauvegarde échouée est visible sur la capture suivante. Ce résultat prouve la conservation locale du brouillon, **pas une sauvegarde distante réussie**.

La pile locale unique utilise les versions et images du rapport précédent. Aucun modèle distant, démarrage de workspace utilisateur, génération ou publication payante. Chromium système 154 et Node 24 ne sont pas les versions CI ; aucun contournement réseau ni changement de secrets. Les diagnostics JSDOM de géométrie CodeMirror restent des limites de l'environnement et ne constituent pas un test mobile réel.

## Validation finale

- 78 tests ciblés réussis : `desktop-editor` (4), `index` (27), `mobile-editor` (7), `project-editor-layout` (40). Les tests de propriété couvrent modèle préexistant, deux widgets, notifications externes, démontage indépendant, changement de langue et modèles d'index empruntés.
- Build final réussi (`build-final.log`), typecheck web et packages réussi, typecheck strict éditeur final réussi. Aucun changement de dépendances ni de lockfile.
- ESLint des fichiers modifiés hors fichier éditeur historique réussi, Prettier et diff-check réussis. Le fichier éditeur conserve les sept erreurs ESLint préexistantes : noms DesktopCodeEditor, MobileCodeEditor, EditorAdapter et TouchSymbolToolbar ; propriété length ; deux consistent-return. Aucun lint global vert revendiqué.
- E2E bornés : six passages verts (identité/brouillon/épinglage et flottant/réancrage, trois répétitions chacun), un worker, zéro retry. Puis extension du test flottant au partage et au changement de langue simultané : trois nouveaux passages verts en 47,0 s.
- Le test étendu ouvre le même fichier dans deux éditeurs, conserve les anciens nœuds DOM Monaco, attend leur déconnexion après changement de langue, vérifie deux widgets neufs avec le contenu correct, ferme un volet puis vérifie le survivant. Captures finales de langue partagée et survivant inspectées.
- Le relevé navigateur séparé `shared-real.log` observe réellement `getEditors()`, l'identité du modèle commun, son URI et son état non détruit : deux widgets / même modèle avant et après langue française, un modèle toujours vivant après fermeture d'un volet. Aucun remplacement de Monaco par un mock dans ce relevé.
- Les trois scénarios du correctif précédent (normal, import retenu après A, import retenu après A/B/A) sont rejoués : douze instantanés modèle/store/texte concordants, réouvertures incluses (`cold-after.log`).
- Un brouillon TypeScript est aussi vérifié : valeur `UNSAVED-A-UNIQUE`, chemin `/home/project/audit.ts`, fichier encore non enregistré, aucune requête de stockage pendant A/B/A (`draft-ts-after.log`). L'onglet A épinglé reste présent après ouverture de B ; capture inspectée. L'autosauvegarde échouée reste explicitement visible, aucune persistance distante validée.
- Relecture indépendante favorable du moteur épinglé, des modèles partagés et du test navigateur ; le pont BaseChat écrit par le relecteur a été relu par l'agent principal. Aucune publication autorisée avant relecture du parent.

## Limite isolée du harnais Vitest

L'extension unitaire qui change simultanément la langue de deux widgets bloque une des importations dynamiques. Le probe minimal reproduit ce blocage **sans React ni modèle** : après un premier `await load()`, `Promise.all([load(), load()])` ne se résout pas, avec `load = () => import('monaco-editor/esm/vs/editor/editor.api')`. Journal `parallel-import-probe.log`. Même résultat avec factory synchrone et reset du cache ; aucun correctif produit n'en a été déduit.

Cette vérification simultanée est donc portée dans le test navigateur réel décrit ci-dessus, avec assertions sur le remplacement effectif des deux widgets puis leur contenu. Les contre-épreuves unitaires de collision, de notifications et de nettoyage restent inchangées ; elles incluent le changement de langue après le démontage du premier widget. Aucun test en échec masqué par skip, aucune assertion sur le comportement produit assouplie. Les essais diagnostiques temporaires et logs sont conservés dans `/tmp/review2-evidence/`, hors code de production.

La capture du volet flottant montre aussi une zone rognée à droite par la bibliothèque. Ce constat visuel n'est pas réparé ici ; aucune validation globale du placement ou du responsive n'est revendiquée.

## Vérification avant PR brouillon

La découverte Playwright est rejouée avec la configuration CI, `--project=chromium --grep-invert @runtime --list`, sans exécution de suite complète. Les deux nouveaux fichiers E2E sont présents. Le prédicat d’inventaire extrait du script de garde inchangé calcule 70 fichiers attendus ; la découverte en contient 70, aucun manquant. Les workflows, gardes et dérogations ne sont pas modifiés. Nouveau passage ciblé : 114 tests réussis, comprenant les 78 tests produit et 36 contrôles de garde CI, budget, configuration, traces et index. L’index canonique est régénéré deux fois : 422 entrées et SHA-256 identique `994cc010f6b1950c8cce781af7aa307e1da5270bfe4b8226fc067e5cf059591b` ; seconde génération sans diff.

Le complément de coordination ajoute uniquement les fusions déjà réelles #727, #728 et #729, avec métadonnées et listes de fichiers relues par API. Les anciennes lignes sont conservées octet pour octet. Les preuves de livraison #729 restent explicitement attribuées à la session parent, non revérifiées ici. Les quatre commits produit restent distincts ; aucune réinstallation de dépendances ni modification du lockfile. La publication autorisée porte sur la branche et une PR brouillon, sans fusion.

Reconfirmation sur le lot final avant publication : build client/serveur réussi et typechecks web/packages réussis, exit 0, avec pnpm 9.14.4 sans réinstallation. Les 114 tests ciblés sont verts ; les neuf passages navigateur précédents portent sur le même code produit, inchangé dans ce complément documentaire. Relecture indépendante favorable du journal et de cette préparation.
