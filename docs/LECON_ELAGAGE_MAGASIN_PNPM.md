# Une mesure cohérente avec elle-même n'est pas une mesure juste

À l'usage de qui touchera `scripts/elaguer-magasin-pnpm.mjs` dans six mois.
Trois pages d'histoire tiennent en une phrase : **le seul contrôle qui vaut est
celui qui exerce le résultat.**

## Ce qu'a fait cet outil

Il supprime du magasin `node_modules/.pnpm` les entrées qu'aucun lien symbolique
n'atteint, pour sortir des images de production du code que la résolution de Node
ne peut pas charger — et les failles qu'il porte.

L'idée est juste. L'implémentation s'est trompée **trois fois**, et chaque fois
on l'a appris en production.

| # | le trou | découvert par | coût |
|---|---|---|---|
| 1 | la marche transitive descendait dans `<paquet>/node_modules`, qui n'existe pas chez pnpm : les dépendances d'une entrée sont ses **voisines** dans `.pnpm/<entrée>/node_modules/` | crochet `prisma-migrate` mort sur `Cannot find module '@prisma/engines'` | déploiement reverti (`--atomic`) |
| 2 | un lien d'entrée venant de `node_modules/.bin/` désigne un **fichier**, donc ses dépendances n'étaient jamais parcourues | même panne, même correctif | — |
| 3 | `node_modules/.pnpm/node_modules/`, le répertoire **hoisté** que la résolution CJS traverse en remontant (1 124 entrées ici), était ignoré | serveur web mort sur `Cannot find module '@smithy/util-config-provider'` | pod bloqué 10 min à 1 réplique sur 2, rollback Helm |

Effet cumulé des trois correctifs, **même arbre, même commande** :

```
atteignables / 2 056 entrées
   236   version d'origine
 1 918   après le correctif 1+2
 2 022   après le correctif 3
```

La première mesure annonçait « neuf entrées sur dix sont mortes ». C'était
**neuf sur dix sont vivantes**.

## Pourquoi les garde-fous n'ont rien vu — le point à retenir

Le script en avait quatre, écrits de bonne foi :

1. un **plancher** d'entrées atteignables, pour refuser si le parcours a échoué ;
2. un refus si le magasin est introuvable ;
3. `--dry-run` par défaut ;
4. un contrôle de **cohérence** : après élagage, `restantes == atteintes`.

Aucun ne pouvait détecter les trois trous, et la raison est structurelle :

> **Le plancher et le contrôle de cohérence vérifient la cohérence INTERNE de la
> mesure. Ils étaient tous les deux vrais d'un marquage FAUX.**

154 atteignables franchissait largement un plancher de 20. Et `restantes ==
atteintes` est vrai par construction dès que la suppression suit le marquage,
quel que soit le marquage. Un garde qui mesure la mesure ne détecte pas une
mesure fausse.

## Ce qui les remplace

Un **contrôle positif qui exerce le résultat**, dans `Dockerfile`, juste après
l'élagage : on démarre le serveur réellement livré et on exige une réponse de
`/health`. Si une entrée encore requise a été supprimée, **la construction
échoue** — plus jamais le déploiement.

Sa viabilité a été vérifiée avant d'être écrite, et c'est la moitié qu'on oublie :
sondé dans l'image servie, `node ./server.mjs` répond `/health` en **14 s sans
aucune variable d'environnement**. Le contrôle ne peut donc pas rougir pour une
base de données absente.

Les trois trous sont par ailleurs épinglés un par un dans
`tests/guards/elagage-magasin-pnpm.spec.ts`, chacun sur un banc à la forme exacte
du défaut, chacun vérifié rouge sans son correctif.

## Les trois règles à emporter

1. **Un garde-fou qui ne peut pas rougir sur le défaut qu'il prétend couvrir est
   une décoration.** Avant de l'écrire, demandez-vous : si la mesure était
   fausse, que dirait ce contrôle ? Si la réponse est « la même chose », il ne
   couvre rien.
2. **Exercez le résultat, pas la mesure.** Démarrer l'image, résoudre un module,
   appeler l'endpoint. Un chiffre cohérent ne prouve rien ; un programme qui
   démarre prouve quelque chose.
3. **Une analyse d'atteignabilité écrite à la main sur un `node_modules` pnpm est
   un nid à cas particuliers** — voisines, `.bin`, répertoire hoisté, et
   probablement d'autres qu'on n'a pas encore rencontrés. Si vous devez y
   retoucher, ajoutez d'abord un banc, et gardez le contrôle de démarrage.
