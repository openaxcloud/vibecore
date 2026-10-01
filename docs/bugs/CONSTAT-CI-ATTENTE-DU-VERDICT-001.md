---
id: CONSTAT-CI-ATTENTE-DU-VERDICT-001
section: "2026-10-01 — Chaîne de tests : chemin critique de la porte de release"
---

# CONSTAT-CI-ATTENTE-DU-VERDICT-001

**Nature** — CONSTAT, pas un défaut. **Aucun correctif propre : il se règle par ailleurs.**

## Le fait

Le job `verdict` d'`e2e.yml` — celui qui porte le contrôle requis « Playwright local
stack » — a attendu **8 min 38 s** un coureur, pour un travail de **10 secondes**.

Mesuré le 2026-09-30 sur l'E2E de `1fb51f092a` :

| job | créé | démarré | attente |
|---|---|---|---|
| E2E tranche 1/2 | 21:05:35 | 21:05:37 | **2 s** |
| E2E tranche 2/2 | 21:05:35 | 21:05:37 | **2 s** |
| Playwright local stack | 22:03:08 | 22:11:46 | **8 min 38 s** |

## Les trois causes qu'on soupçonne d'abord, et pourquoi elles sont fausses

**Une étiquette de coureur différente ?** Non : les trois jobs demandent
`runs-on: ubuntu-latest`.

**Une dépendance mal posée ?** Non : `needs: e2e` est correct et nécessaire — la porte
fusionne les rapports des deux tranches, elle ne peut pas s'exécuter avant. La
conséquence est que le job n'est **créé** qu'à la fin des tranches, et c'est voulu.

**Une lenteur du job lui-même ?** Non : ses cinq étapes (dépôt, Node, téléchargement des
artefacts, affichage, porte) prennent 10 s au total. L'attente est **avant** lui.

## La vraie cause

**C'est de la contention à l'instant précis de sa création.** Les tranches ont obtenu un
coureur en 2 s parce qu'elles ont été créées à 21:05, quand le compte était au repos. La
porte a été créée à 22:03, quand il ne l'était pas — 55 minutes plus tard, au milieu de la
CI des autres propositions.

Autrement dit : **ce n'est pas une anomalie du job, c'est le prix de la charge totale au
moment où il demande sa place.** Le même job, les mêmes étiquettes, 2 secondes ou neuf
minutes selon l'heure.

## Pourquoi il n'y a rien à corriger ici — et où ça se corrige

Rien dans ce job ne peut raccourcir une attente d'allocation. Les deux seules portes de
sortie seraient de supprimer le besoin d'un second coureur — impossible, la porte doit
voir les deux rapports — ou de **réduire la charge totale**. C'est la seconde qui est
prise, et par deux chantiers mesurés :

* **le cache des navigateurs** rend 10 min 33 s de coureur **par tranche**, soit ~21 min
  par passage E2E ;
* **le canari hors du chemin critique** rend 15 min 12 s.

~36 minutes d'occupation de coureur en moins par passage : c'est exactement ce dont vit la
contention. **Ce constat se ferme donc par les deux autres, pas par lui-même.**

## Ce qui reste disponible ici, et pourquoi je ne le prends pas

Le job lance `actions/setup-node` pour exécuter un script qui n'importe que des modules
`node:` — le coureur a déjà Node. Le retirer gagnerait **une quinzaine de secondes** sur
un poste de huit minutes et demie. Toucher au job qui rend le verdict de toutes les
propositions pour 15 s n'est pas un arbitrage raisonnable ; c'est noté pour le jour où ce
fichier sera ouvert pour une autre raison.

## Mesure à refaire pour clore

Après la fusion du cache et du découpage du canari, remesurer l'attente de ce job sur un
passage de nuit **et** un passage de journée. Si elle reste de l'ordre de 8 minutes à
charge réduite, l'explication par la contention est fausse et ce constat est à réouvrir —
c'est la contre-épreuve qui manque aujourd'hui, faute d'avoir les deux chantiers en place.
