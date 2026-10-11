---
id: BUG-DEPLOY-BASE-DES-TIERS-PERIMEE-001
section: "2026-10-01 — Chaîne de tests : chemin critique de la porte de release"
---

# BUG-DEPLOY-BASE-DES-TIERS-PERIMEE-001

**Gravité** — JAMAIS FAUX, mais **deux à quatre fois plus lent**. C'est le goulot mesuré de
la journée du 2026-10-01, pas un détail d'optimisation.

**État** — 📤 dispatché (cette session) · 💻 codé (`fix/base-du-dernier-deploiement`) ·
⬜ non testé live.

## Ce qui se passe

`deploy-main.yml` choisit les tiers à reconstruire en comparant le commit déployé à la base
« dernier déploiement RÉUSSI », qu'il demande ainsi :

```
gh api ".../actions/workflows/deploy-main.yml/runs?branch=main&status=success&per_page=1" \
  --jq '.workflow_runs[0].head_sha // empty'
```

**`per_page=1` fait dépendre toute la détection de la fraîcheur du premier résultat.** Et le
2026-10-01, ce premier résultat a été un run du **2026-09-10** — à **145 commits et 21
jours** de `HEAD` — **trois fois dans la même journée** :

| run | commit déployé | heure | base rendue |
|---|---|---|---|
| 36826309655 | `56be2d3880` | 08:21 | `55b8696a2e` (2026-09-10) |
| 36864115016 | `f94b2db3fb` | 12:59 | `55b8696a2e` (2026-09-10) |
| 36880721181 | `11c7732bf7` | 15:27 | `55b8696a2e` (2026-09-10) |

Une base à 145 commits contient forcément `pnpm-lock.yaml`, donc le motif de base partagée
matche, donc :

```
Shared/base input changed -> build ALL tiers
Tiers to build -> runtime=true web=true wsagent=true admin=true
```

**Quatre images reconstruites pour un changement qui en touche deux.** Mesuré le même jour :
~20 min à un tier, ~51 min à deux. C'est ce qui a transformé des cycles de 90 min en cycles
de 2 h 50, et c'est pourquoi mes projections de la journée ont été fausses : je projetais
sur le nombre de tiers que le diff justifie, pas sur celui qui est réellement construit.

## Ce qui n'est PAS la cause — trois hypothèses tuées par la mesure

1. **Clone superficiel** — le `checkout` de ce job porte `fetch-depth: 0`, et le code
   protège déjà par `git cat-file -e`. Mort.
2. **Base partagée réellement touchée** — entre `e8570fb2c9` et `11c7732bf7`, aucun fichier
   ne matche le motif de base partagée. Mort.
3. **Décalage de temps** — le run d'`e8570fb2c9` s'est terminé à 14:50, le job de build de
   `11c7732bf7` a démarré à 15:27 : il était bien le dernier succès au moment de la requête.
   Mort.

## ⚠️ Ce qui reste INEXPLIQUÉ, et je le dis au lieu de le combler

**La même requête, depuis mon poste, rend toujours le bon résultat.** Vérifié quatre fois,
avec et sans `branch=main` : elle rend `11c7732bf7`. Dans Actions, avec
`secrets.GITHUB_TOKEN`, elle a rendu trois fois un run du 10 septembre. Je ne sais pas
pourquoi, et **je n'ai pas de mesure qui tranche** — l'écart peut venir du jeton, d'un
index à cohérence différée, ou d'un cache. Ce qui est mesuré, c'est l'écart lui-même.

Un relevé utile au passage : `total_count` vaut **934** runs réussis. Si la liste rendue
dans Actions est une page périmée *entière*, demander 50 candidats au lieu d'un ne suffira
pas — ils seront tous vieux. Le correctif ci-dessous **ne prétend donc pas** supprimer la
péremption : il la rend **visible** et il choisit au mieux parmi ce qu'on reçoit.

## Le correctif

1. **50 candidats au lieu d'un**, et le choix se fait **côté client** : parmi les candidats
   qui sont des ancêtres de `HEAD`, on prend celui dont `git rev-list --count BASE..HEAD`
   est le plus petit. Plus aucune dépendance à l'ordre rendu par l'API.
2. **Le compte est journalisé** (`Candidats de base : N rendus, M ancetres de HEAD`), parce
   qu'une liste vide et une boucle qui n'a pas tourné se lisent pareil.
3. **Un `::warning::` quand la base retenue est à plus de 50 commits de `HEAD`.** C'est le
   signal qui aurait révélé ce défaut le jour où il est apparu, au lieu de trois semaines
   de builds inutiles payés en silence.
4. **L'erreur de `gh api` n'est plus masquée** (règle 13) : un `403` sur `actions: read`
   rendait une liste vide, et une liste vide se lit comme « aucun déploiement réussi ».

**La correction du CHOIX est sûre**, et c'est le point à ne pas rater : un déploiement
réussi garantit que chaque tier y était soit reconstruit, soit déjà à jour. Prendre le
**plus proche** de ces déploiements est donc correct *et* minimal — ce n'est pas un
assouplissement du garde-fou conservateur, c'est le même invariant, calculé juste.

## Épinglé par

`tests/guards/base-du-dernier-deploiement.spec.ts` — il n'inspecte pas le texte du
workflow : il **exécute** l'étape dans un dépôt jetable de 60 commits avec un faux `gh` sur
le `PATH`, et vérifie la DÉCISION DE TIERS qui en sort. Le levier qui rend la conséquence
visible est un commit intermédiaire qui touche `pnpm-lock.yaml` : une base choisie avant lui
reconstruit tout, une base choisie après non. Sans ce levier, les deux cas rendraient la
même décision et le garde ne mesurerait que son propre journal.

**Contre-épreuve faite dans les deux sens** : correctif retiré → **4 cas sur 5 rouges**,
dont la contre-épreuve du candidat unique (il prend le périmé, sans un mot) et le contrôle
du `per_page` (« ne demande que 1 candidat »). Correctif remis → 5/5 au vert.

## Suite à mesurer

Si le `::warning::` de base lointaine se déclenche encore après ce correctif, l'explication
par l'ordre est insuffisante et c'est bien la **page entière** qui est périmée. Le vrai
correctif serait alors de lire la vérité au lieu de la demander : le `imageTag` courant de
la release Helm, service par service. Ça demande les identifiants du cluster **avant**
l'étape de détection, donc un déplacement d'étape — à ne pas faire avant d'avoir la mesure.
