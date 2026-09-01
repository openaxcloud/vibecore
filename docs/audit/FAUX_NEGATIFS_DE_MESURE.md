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
