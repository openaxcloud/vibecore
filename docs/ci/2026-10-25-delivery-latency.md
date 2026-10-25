# Délais CI et livraison — 25 octobre 2026

Base examinée : `main b9a366235`, après livraison du moteur Node. Aucune modification du moteur, de Fleet (#789), des panels (#788), des quotas, des runners ou des accès. Les contrôles i18n/E2E/sécurité et le gate exact-SHA restent en place.

## Mesures récentes

Les durées de workflow ci-dessous vont de `created_at` à `updated_at` terminal. Elles incluent les attentes et ne sont pas des minutes facturées. Les jobs permettent de distinguer attente après création et exécution ; la cause précise de l'allocation GitHub n'est pas exposée par ces données.

| Tête PR | CI | E2E | Audit français | PR Validation | Desktop |
|---|---:|---:|---:|---:|---:|
| c69820e | 26m14 | 61m39 | 87m15 | 32m33 | 42m59 |
| e03cd49 | 53m30 | 64m56 | 80m16 | 65m56 | 28m59 |
| 83ffe57 | 29m37 | 70m46 | 54m55 | 49m06 | 23m13 |
| main b336a67 | 23m06 | 16m23 | — | — | — |

Sources : [CI e03cd49](https://github.com/openaxcloud/vibecore/actions/runs/40206581621), [E2E 83ffe57](https://github.com/openaxcloud/vibecore/actions/runs/40212702723), [audit c69820e](https://github.com/openaxcloud/vibecore/actions/runs/40201032507), [PR Validation 83ffe57](https://github.com/openaxcloud/vibecore/actions/runs/40212702559), [CI main](https://github.com/openaxcloud/vibecore/actions/runs/40218474292), [E2E main](https://github.com/openaxcloud/vibecore/actions/runs/40218474276).

| Job | Attente après création | Exécution |
|---|---:|---:|
| CI e03cd49 | 35m09 | 18m20 |
| E2E tranche 3, 83ffe57 | 41m29 | 25m38 |
| Audit tablette, 83ffe57 | 31m28 | 15m42 |
| Synthèse E2E, e03cd49 | 12m59 | 18s |
| Verdict français, c69820e | 23m25 | 5s |
| Release Validation, 83ffe57 | 18m05 | 12s |
| CI main b336a67 | 3s | 23m02 |

Exemple : Release Validation est créé à 17:10:01, à la fin de son prédécesseur Quality Gates, mais démarre à 17:28:06 et termine à 17:28:18. Les 18m05 sont donc une attente **après** satisfaction de `needs`, pas un calcul de validation lent. La saturation d'ordonnancement est une explication compatible, pas un quota identifié. Aucun changement de capacité n'est proposé.

## Répétitions et livraison

La PR #783 a eu trois campagnes successives c69820e → e03cd49 → 83ffe57. Les deux dernières intégrations de main (#784 puis #786) étaient nécessaires car l'index documentaire généré était en conflit ; le BFF et les composants fusionnaient automatiquement. Chaque nouvelle tête a dû repasser sa CI exacte. Les cinq workflows échantillonnés s'étendent de 14:11:00 à 17:49:59. Ce total n'est pas un gain évitable démontré : les campagnes se chevauchent et main apportait aussi du code.

Action de coordination : regrouper les intégrations requises avant la dernière campagne et éviter les réécritures purement documentaires de la tête pendant sa CI. Un conflit réel reste à résoudre ; les résultats d'un SHA ne valent jamais pour un autre. Aucun merge driver permissif ni suppression du contrôle d'index n'est ajouté.

Le [déploiement b336a67](https://github.com/openaxcloud/vibecore/actions/runs/40218474214) a pris 77m42 :

- 29m30 avant création du premier job, jusqu'à la fin exacte du déploiement précédent : file `concurrency` exclusive, confirmée par les timestamps ;
- environ 1m46 de résolution/gates/transitions ;
- 46m25 pour build et déploiement, dont runtime 24m09, web 9m39, agent 2m23, scan/SBOM 2m29 et Helm 5m22.

La sérialisation des rollouts et le build séquentiel restent inchangés. Déclencher un autre déploiement ne rendrait pas le premier plus rapide.

## Défaut concret corrigé : dépendances WebKit installées pour Chromium

Le [job E2E tranche 3](https://github.com/openaxcloud/vibecore/actions/runs/40212702723/job/121227974540) utilise Chromium seul, mais l'action commune exécutait toujours `playwright install-deps chromium webkit`.

- Préparation totale : **18m05**.
- Restauration du cache navigateur : **3,859s**, cache trouvé.
- Installation navigateurs/dépendances : **14m40** ; apt télécharge **119 Mo en 14m16** à 139 kB/s, installe 181 paquets et en met à jour 8.
- Build web : **2m10**.
- Dry-run Playwright 1.59.1 pour Ubuntu 24.04 x64 : **33 dépendances directes Chromium**, **72 avec WebKit**, soit **39 supplémentaires**. Les paquets installés réellement incluent les dépendances transitives.

[Preuve expurgée, commandes dry-run et extrait horodaté](browser-system-deps-proof.json). Aucun apt n'a été exécuté pour le diagnostic. Le cache de #648 existe déjà dans main ; cette PR est encore ouverte, son contenu est présent via d'autres commits. Aucun nouveau cache n'est ajouté.

Le correctif sélectionne les dépendances système selon l'entrée `navigateurs`, transmise par variable d'environnement et limitée aux deux valeurs existantes. Chromium est toujours installé/réparé après cache ; le canari garde ses dépendances et son binaire WebKit. Les trois tentatives apt, la purge après échec et la gestion consultative existante de l'installation WebKit sont préservées. Aucun job, scénario, condition de succès, permission ou gate n'est supprimé.

## Validation et limites

- **61/61 tests ciblés**, dont huit exécutent le vrai shell de l'action avec uniquement les installateurs externes remplacés. Ils couvrent les deux ensembles, les entrées invalides, la réparation après cache, les reprises et l'arrêt après trois erreurs apt.
- Contre-épreuve sur l'ancienne action : **5 échecs / 3 succès** ; retour au correctif : **8/8**.
- Une première version du harnais avait une interpolation TypeScript invalide ; corrigée avant les contre-épreuves. Aucun code produit modifié pour ce problème de test.
- Relecture indépendante favorable, avec huit tests exécutés séparément : les 12 autres étapes et les deux appelants sont inchangés. Typage et lint globaux réussis via le hook du dépôt (zéro erreur, 52 avertissements historiques).
- Aucun build produit local supplémentaire : aucune source produit n'est changée. La CI E2E conserve son build et ses quatre tranches ; son résultat et le gain réel restent à vérifier sur le SHA de la PR.

Le gain de temps n'est pas encore mesuré après correctif : les 14m16 décrivent toute l'opération apt ancienne, **pas une économie promise**. La CI suivante doit confirmer la sélection Chromium, le canari WebKit et le temps de préparation. La réduction des dépendances ne résout pas les dizaines de minutes d'attente d'allocation GitHub ni la file exclusive de déploiement.
