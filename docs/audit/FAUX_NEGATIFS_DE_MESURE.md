# Faux négatifs de mesure — relevé du 2026-08-31

Tous ont la même forme : **l'outil n'a rien mesuré et a rendu un résultat
rassurant.** Aucun n'a produit d'erreur visible. Chacun est daté et chiffré.

| # | Sonde | Ce qui n'allait pas | Ce qu'elle rendait | Remède appliqué |
|---|---|---|---|---|
| 1 | balayage de contraste de l'IDE | `waitUntil: 'networkidle'` ne se produit **jamais** dans l'IDE (websocket du terminal, sondes de statut, HMR) | **« 0 défaut »** sur une page jamais chargée | `SWEEP_WAIT=dom` + attente explicite, et un test de couverture qui échoue si aucune paire n'a été résolue |
| 2 | résolution de thème | la feuille **compilée** écrit `[data-theme=light]` **sans guillemets**, la source en met | le thème **sombre** mesuré deux fois, vert et faux | cas « la résolution distingue bien les deux thèmes », contre-vérifié |
| 3 | lecture d'une capture à l'œil | le blanc sur orange se lit comme du texte sombre à petite taille | « avant et après sont identiques », alors que **rien n'était appliqué** | ne conclure que sur `getComputedStyle`, jamais sur une capture |
| 4 | capture de requêtes | corps **tronqués à 4 000 octets** par la sonde | « le marqueur n'est pas dans la charge » — il était **au-delà de la coupure**. Les corps faisaient **exactement** 4 000 o, ce qui aurait dû alerter | capturer le corps entier, et se méfier de toute taille égale à la limite |
| 5 | comptage de défauts | le fichier de test n'existait pas sur la branche | `grep \| wc -l` = **0**, indiscernable de « aucun défaut » | vérifier le nombre d'éléments examinés avant de lire le résultat |
| 6 | filtre de contrôles CI | le filtre ne matchait **aucun** contrôle | `,,` lu comme **« tout est vert »**, sur une PR dont la CI n'avait pas démarré | exiger d'avoir trouvé les 3 contrôles attendus, sinon refuser de conclure |
| 7 | état des déploiements | 8/8 « Ready et à jour »… pour la révision **précédente** | « mon changement est déployé », alors que le build tournait encore | **seule la révision Helm fait foi**, jamais l'état Ready |
| 8 | frappe dans l'éditeur | rien ne garantissait que la saisie avait atteint Monaco | un verdict de **perte de données** sur une frappe jamais arrivée | relire le contenu de l'éditeur et l'asserter avant de sauvegarder |
| 9 | trace d'URL | l'hôte effacé du relevé (`replace(/https?:\/\/[^/]+/, '')`) | impossible de distinguer `app.` de `api.` — donc de savoir **quel service** traitait la requête | garder l'hôte dans les traces |
| 10 | boucle sur les pods | la liste de pods mal découpée n'en parcourait **qu'un sur cinq** | « 0 erreur 5xx » sur 20 % du parc | écrire la liste dans un fichier, compter les lignes, boucler dessus |
| 11 | lint | le **cache eslint** rendait 81 erreurs là où il y en avait 269 | « mon changement ajoute 188 erreurs » — il n'en ajoutait **aucune** | vider le cache avant toute comparaison avant/après |
| 12 | test lancé depuis la racine | vitest ne trouve pas les specs de `services/api` depuis la racine | **« No test files found »**, exit 1, lu comme un échec de test | lancer depuis le paquet concerné |
| 13 | lanceur d'arrière-plan | les scripts lancés en arrière-plan étaient **tués puis relancés** en vol (`etime` du processus node à 44 s alors que la campagne durait depuis 12 min) | **journal vide** et sondes d'état répondant « toujours en cours » | lancer les campagnes longues **au premier plan** avec un `timeout` explicite |
| 14 | sonde `pgrep -f` sur le nom du script | le motif matchait **le shell qui contenait le texte du script** (heredoc), pas le processus node | **« RUNNING »** pendant des minutes sur un travail **déjà terminé** | ancrer sur `ps -axo command` + `^node <chemin>`, et vérifier que le fichier de sortie grossit |
| 15 | `tsc --noEmit` | épuisement mémoire de V8, **sortie 134**, avant d'avoir typé les fichiers modifiés | **« 0 erreur »** sur mon changement | `NODE_OPTIONS=--max-old-space-size=8192`, et **témoin obligatoire** : injecter une erreur de type et vérifier qu'elle est rapportée |
| 16 | durée écoulée estimée au ressenti | aucune mesure : « ~3 h » annoncé pour une construction démarrée depuis **18 minutes** | « c'est bloqué, il faut relancer » au lieu de « c'est en cours, il faut attendre » — **décisions opposées** | soustraire deux horodatages, jamais estimer |
| 17 | sonde de défilement du panneau Agent | la sonde posait `out.scrolled = true` en dur, puis l'étalait par-dessus le résultat réel (`{...result}`) | **« défilement réussi »** quoi qu'il arrive, y compris quand le conteneur visé n'existait pas | ne jamais nommer un champ de sortie comme une conclusion ; vérifier `scrollTop` APRÈS coup |
| 18 | sonde de correspondance CSS | sur WebKit, `cssRules` existe sur **toute** règle ; le parcours traitait donc chaque règle comme un conteneur et n'en testait aucune | **« aucune règle ne fixe la taille de cet élément »** — impossible pour un élément affiché (témoin : `anySelectorMatched: 0` sur 290 règles, 11 feuilles) | distinguer les règles groupantes par leur `type`, et **compter les règles parcourues** avant de lire un zéro |
| 19 | sonde d'état de rebase | `[ -d .git/rebase-merge ]` — dans un **worktree**, l'état vit dans `.git/worktrees/<nom>/rebase-merge` | **« REBASE COMPLETE »** alors que le rebase était arrêté sur un conflit, et qu'un commit semblait perdu | lire `git status`, qui est l'autorité ; `git rev-parse --git-dir` donne le bon répertoire |
| 20 | le dépôt partagé lui-même | trois remises à zéro du checkout principal dans la journée (bascule de branche par une autre session), sans avertissement | **le travail écrit « existe »** — il est à l'écran, il est dans le fichier — puis il n'existe plus, et rien ne le signale. Entrées 13-17 du registre perdues une fois, huit lignes d'inventaire perdues DEUX fois | **copier tout écrit durable dans un dossier NON SUIVI avant de continuer**, puis le porter en ligne dès que possible. Acquis après trois effacements : la 1ʳᵉ fois j'ai réécrit, la 2ᵉ j'ai copié le code mais pas les documents, la 3ᵉ seule la copie a sauvé le travail |
| 21 | tout comptage de fichiers par chemin | un fichier **présent par accident** — résidu non commité ramassé par un archivage automatique — est indiscernable d'un fichier **présent par choix**. Mesuré : `.github/workflows/deploy-prod.yml`, seul fichier « absent de `main` » d'une branche orpheline, arrivé par un commit intitulé « travail non commité de vc-ideux [fix/ide-panel-resolution] » — un worktree consacré à un TOUT AUTRE sujet | « un fichier de travail unique à sauver ». En réalite `main` ne l'avait pas perdu : `main` l'avait **supprimé** par la PR #132, celle qui installe la porte exact-SHA. Le restaurer aurait rouvert une seconde voie de déploiement en production contournant cette porte — une régression de sécurité présentée comme une récupération | avant d'extraire un fichier « absent de `main` », chercher s'il y a **déjà existé** : `git log --diff-filter=D origin/main -- <chemin>`. Une suppression délibérée ne se distingue d'une perte que par l'historique |
| 22 | comparaison de sujets de commits à `main` | `main` fusionne en **squash** : ses sujets sont des titres de PR, jamais ceux des commits de branche. Le test ne pouvait structurellement rien trouver | **« 0 trouvé / 153 absents »**, à l'identique sur trois branches indépendantes. **Un taux d'échec de 100 % identique sur des entrées indépendantes n'est pas un résultat, c'est une panne** | comparer le CONTENU (`git diff --quiet origin/main...<branche>`) ou chercher la PR fusionnée par titre — jamais les sujets de commits |
| 23 | comptage de résultats via `jq`/`-q '.[0]'` | sur un tableau vide, `.[0]` rend `null` ; la condition comparait à la chaîne `"null"` alors que la sortie réelle était `"#null null"` | **« TROUVÉ »** pour les huit sujets testés — **l'exact contraire de la vérité** | compter les éléments (`len(json.load(...))`), et valider la méthode par un témoin positif ET un témoin négatif avant de l'utiliser |
| 24 | refspec de `git push` en zsh | `"$src:refs/heads/$dst"` — zsh a appliqué le **modificateur d'historique `:r`** et mangé deux caractères | `src refspec …20260831efs/heads/… does not match any`, trois fois. Message trompeur : lisible comme un refus du serveur, comme la vraie limite de taille rencontrée une heure plus tôt | accolader (`${src}:refs/heads/${dst}`), et **vérifier la présence sur le distant** (`git ls-remote`) plutôt que croire l'absence d'erreur |
| 25 | détecteur de « contenu chargé » | il déclarait STABLE après 3 lectures identiques : il mesurait l'**immobilité**, pas la **présence**. Un palier transitoire suffisait | **162 caractères** rendus comme état final d'un panneau qui en porte 915. Puis, une fois le seuil ajouté : trois panneaux sains déclarés en échec — `env` raté de **8 caractères**, `logs` recalé parce qu'il oscille de 5 caractères en affichant des journaux vivants | critère PRINCIPAL = marqueur sémantique du contenu attendu ; la stabilité n'est qu'une condition secondaire, et tolérante |
| 26 | `PerformanceObserver` sur WebKit | `observe({entryTypes:['longtask']})` est **accepté sans erreur** pour un type que WebKit n'implémente pas, puis n'émet jamais rien. Types réellement supportés : `event, first-input, largest-contentful-paint, mark, measure, navigation, paint, resource` | **zéro tâche longue** sur 7 s d'activité navigateur — un zéro qui se lit comme un résultat. J'ai failli conclure « défaut de sonde » sur un comportement parfaitement normal | interroger `PerformanceObserver.supportedEntryTypes` AVANT d'observer, et provoquer une tâche longue connue comme témoin |
| 27 | `tsc` sur un fichier portant `// @ts-nocheck` | l'outil fonctionne, le projet inclut bien le fichier (`--listFiles` le confirme), et pourtant rien n'en sort : c'est le FICHIER qui s'exclut | **« 0 erreur »** sur `BaseChat.tsx` (23 800 lignes, panneau Agent) quoi qu'on y écrive — vérifié en injectant `const __TEMOIN_TYPE: number = "pas un nombre"`, jamais rapportée. Plusieurs sessions y ont travaillé en le croyant vérifié | **le témoin doit être dans le FICHIER dont on lit le résultat.** Placé ailleurs, il valide l'instrument et pas la mesure |
| 28 | nom de chunk produit par Rollup | un nom de chunk est le module que l'outil a choisi comme représentant. **Il ne dit rien de la composition** — et il ne se trompe pas dans un seul sens : `legal-dates` contient **0 route**, tandis que `api.integrations.api-key._provider.configure` en agrège **191** | d'abord « 10 modules de routes » (surestimation par le nom), puis, la composition mesurée, **223**. Deux conclusions fausses tirées de la même étiquette, en sens opposés | lire la composition (`generateBundle` → `chunk.modules`, ou un manifeste de build), jamais le nom |

## La règle qui en découle

**Toute mesure doit distinguer « rien trouvé » de « rien exécuté ».**

En pratique, avant de lire un résultat, se poser trois questions :

1. **Combien d'éléments la sonde a-t-elle examinés ?** Si le nombre est nul ou
   inattendu, le résultat ne vaut rien.
2. **Le résultat pourrait-il être identique si l'outil était cassé ?** Si oui, il
   manque un test de couverture.
3. **La valeur mesurée est-elle suspecte par sa forme ?** Exactement 4 000 octets,
   exactement 0, exactement la limite : ce sont des signatures de troncature.

## Et la règle jumelle, sur les garde-fous

Trois défauts de la journée avaient un garde-fou **qui passait au vert** :

* `BUG-THEME-008` — un test vérifiait les jetons `--status-*`, l'écran utilisait
  `--vc-ide-accent-*` ;
* `BUG-AGENT-008` — sept tests vérifiaient la **forme** d'un objet d'options,
  aucun ne vérifiait qu'il **atteignait le fournisseur** (le paquet installé
  contient **0 occurrence** de `providerOptions`) ;
* `BUG-CREATE-010` — la recette du premier correctif cherchait
  `persistProjectFileManifest` alors que l'implémentation utilisait la variante
  incrémentale.

**Un garde-fou qui protège la mauvaise chose est pire que pas de garde-fou : il
rassure.** Préférer une énumération dérivée du produit à une liste écrite à la
main — la sonde dérivée a trouvé **43 défauts** là où la liste manuelle en
couvrait **3**.

---

### 29. Compter des identifiants de module au lieu d'octets (2026-09-05)

**Ce que je croyais mesurer.** « 223 modules de route dans la fermeture statique
de la racine » — chiffre obtenu en parcourant `chunk.imports` du bundle Rollup et
en comptant les identifiants de module. J'ai passé une demi-journée à chercher
comment détacher un chunk de 191 routes.

**Ce que ça pesait vraiment.** 10,3 Kio compressés. **1,0 %** du poids JS de la
page. Les 191 modules de route sont des coquilles vides : le framework retire les
exports serveur (`loader`, `action`) au build, il ne reste qu'un enregistrement de
module qui ne rend presque aucun code. Le poids réel du chunk vient de ses treize
modules *partagés*, pas des 191 routes.

**La faute.** Un identifiant de module et un octet ne sont pas la même unité. Le
graphe de Rollup est une structure de **construction** ; il ne dit rien du coût de
**chargement**. J'ai lu une topologie comme si c'était une facture.

**Le contrôle qui l'aurait évitée.** Avant d'optimiser un poids, le mesurer *en
octets*, et de préférence sur l'artefact servi — un `curl` avec `-w '%{size_download}'`
sur les assets réellement préchargés dans le HTML. Trente secondes. Elles auraient
remplacé deux tentatives de découpage et une régression.

### 30. `manualChunks` ne retire pas un module d'un groupe : il redéfinit le groupe (2026-09-05)

**L'attente.** Poser une règle `manualChunks` sur un module, c'est croire qu'on
pose une **exception locale** — « celui-ci sort, le reste ne bouge pas ».

**La mesure.** Deux pas, sur le même dépôt, avec le même instrument :

| | chunks | modules appli | routes |
|---|---:|---:|---:|
| avant | 28 | 467 | 223 |
| épingler `lib/i18n/language` | 29 | 462 | **221** |
| épingler la famille `lib/i18n/catalogs/` | **22** | 565 | **259** |

Le deuxième pas donne **moins de chunks et plus de routes**. Ce n'est pas une
exception qui a mal tourné : c'est une **repartition globale**. Rollup ne retire
pas le module du groupe, il recalcule l'ensemble de la partition, et fusionne
ailleurs ce qu'il séparait avant.

**Ce que ça explique rétroactivement.** La page blanche de CodeMirror d'août avait
été attribuée à un chunk circulaire créé « par accident ». Le mécanisme est plus
simple et plus général : *toute* règle `manualChunks` rebat la partition entière,
donc toute règle peut créer un cycle loin de l'endroit qu'on croyait toucher. Ce
n'était pas un accident, c'était le fonctionnement normal de l'outil.

**La règle.** Une modification de `manualChunks` ne se valide jamais sur la règle
elle-même. Elle se valide sur la **composition mesurée de tout le bundle**, avant
et après — et le signe qui doit alerter est un nombre de chunks qui *baisse* quand
on croyait en ajouter un.

## La règle que ces trente cas imposent

**Avant de croire un outil qui dit « rien à signaler », vérifie qu'il tourne
encore.**

Ils n'ont pas vingt-huit causes, ils en ont une. Un outil qui **n'a pas mesuré**
rend le même résultat qu'un outil qui **a mesuré et n'a rien trouvé**. Le
silence n'est jamais un verdict.

1. **Le témoin positif d'abord.** Faire rendre au moins un résultat connu à la
   même commande avant de lire un zéro.
2. **Prouver la vie du processus, pas son apparence.** Sortie qui grossit,
   horodatage qui avance, code de sortie lu.
3. **Mesurer les durées, ne jamais les estimer.** « Bloqué » et « en cours »
   appellent des décisions opposées.

Sur la seule journée du 2026-09-04, leur absence a produit **sept** conclusions
fausses — dont une annoncée à Avi et qu'il a fallu reprendre.

### Le corollaire, appris à la dure le 2026-09-04

Un outil peut mentir ; **le dépôt aussi**. Sur un checkout partagé entre
sessions, un fichier écrit n'est pas un fichier conservé. La parade est la même
que pour les mesures : ne pas croire ce qui est à l'écran, vérifier que ça
survit. En pratique — copie immédiate dans un dossier non suivi, puis mise en
ligne. Ce document a lui-même été perdu une fois avant d'être écrit ainsi.

### La règle du volume, énoncée généralement (2026-09-05)

**Pour toute surface pouvant être légitimement VIDE, la détection par volume est
structurellement incapable.**

Mesuré : le panneau `secrets` correctement rendu à vide fait **54 caractères** —
« Aucun secret de projet. » — soit **moins que son propre message de chargement**
(83). Aucun seuil, si bien réglé soit-il, ne distingue cet état sain d'un
panneau mort : l'ordre des grandeurs est inversé.

La conséquence dépasse ce panneau. Un compteur de caractères, d'éléments, de
lignes ou d'octets ne peut pas répondre à « est-ce chargé ? » dès lors que
« chargé et vide » est un état valide. Seul un **marqueur du contenu attendu**
le peut — un texte, un attribut, un élément que seule la surface correctement
rendue produit.

Corollaire pratique : avant d'écrire un seuil, se demander à quoi ressemble
l'état vide légitime. S'il existe, écrire un marqueur à la place.

### Le silence légitime, et l'outil bien interrogé (2026-09-05)

Deux fois dans la même nuit, ce qui ressemblait à une panne n'en était pas une :
`tsc` se taisait parce que le fichier portait `@ts-nocheck`, et
`PerformanceObserver` n'émettait rien parce que WebKit n'implémente pas ce type
d'entrée. **Dans les deux cas l'outil avait raison de se taire.** C'est plus
dangereux qu'une panne : une panne laisse un code de sortie, un message, une
pile. Un silence légitime ne laisse rien — il n'y a rien à réparer, donc rien
qui alerte.

Le cas 28 est une troisième forme, plus difficile encore. **L'outil n'a pas
menti : il a été mal interrogé.** Rollup produit une étiquette parfaitement
exacte pour ce qu'elle désigne — le module représentatif d'un chunk — et c'est
nous qui l'avons lue comme une identité. Rien n'est cassé, tout est correct, et
la conclusion est fausse.

Et la nuance qui a failli m'échapper : l'erreur n'était pas de croire ces noms
**trop gros**. `legal-dates` ne contenait aucune route quand
`api.integrations…` en cachait 191. **L'erreur était de croire qu'ils disaient
quoi que ce soit.** Un indicateur non fiable ne se corrige pas en le pondérant ;
il se remplace.

Corollaire opérationnel, valable pour les vingt-huit cas : **le témoin doit
porter sur la même cible que la mesure** — même fichier, même moteur, même
projet, même fenêtre. Un témoin décalé d'un cran valide l'outil et laisse passer
exactement l'erreur qu'on cherchait à exclure.

Enfin, une mise en garde née de la même nuit : après huit outils défaillants,
« c'est encore l'outil » devient un biais à son tour. Deux fois, le comportement
était normal.
