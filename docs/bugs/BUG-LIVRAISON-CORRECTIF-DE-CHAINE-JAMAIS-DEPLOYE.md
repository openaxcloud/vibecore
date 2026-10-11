---
id: BUG-LIVRAISON-CORRECTIF-DE-CHAINE-JAMAIS-DEPLOYE
section: "2026-10-11 — Dette d'infrastructure : la production sait des choses que le dépôt ignore"
---

## Bug

**Un correctif qui ne touche QUE la chaîne de livraison ne déclenche AUCUN déploiement. Il reste
« fusionné » pour toujours sans jamais partir, et tous les voyants sont au vert.**

Le filtre `paths-ignore` de `.github/workflows/deploy-main.yml` couvre `**/*.md`, `docs/**`, **`.github/**`**,
**`tests/**`**, `**/*.spec.{ts,tsx,mjs,js}` et `playwright*.config.ts`. Il ne saute que si **tous** les
fichiers changés y correspondent — ce qui est exactement le cas d'un correctif du workflow de déploiement
accompagné de son test.

Mesuré le 2026-10-11 à 05:37 UTC sur **#696**, dont les deux seuls fichiers sont
`.github/workflows/deploy-main.yml` et `tests/guards/la-grace-atteint-la-prod.spec.ts` :

```
  fusion de #696 sur main             05:36:24 UTC   ->  90c4049f62
  deploiements partis pour ce SHA     AUCUN
  run deploy-main.yml le plus recent  38109565286, et il portait encore 3eb0b4a1e0
```

Il a fallu un `gh workflow run deploy-main.yml --ref main` à la main — `workflow_dispatch` ignore
`paths-ignore` — pour que le correctif atteigne la production (run `38115372477`).

**Pourquoi c'est un piège et pas un réglage.** `paths-ignore` a été élargi pour une bonne raison, écrite dans
le workflow : le 2026-08-27, cinq déploiements d'affilée ont tourné dont **quatre ne changeaient aucun fichier
de runtime**, chacun coûtant une construction séquentielle complète (~50 min) sur un chemin critique
sérialisé. Le filtre est juste. Ce qui manque, c'est qu'il traite **« ne change rien qui s'embarque dans une
image »** et **« ne change rien qui compte »** comme la même chose. Un correctif du workflow de déploiement
ne s'embarque effectivement dans aucune image — **et c'est précisément lui qui doit s'exécuter pour exister.**

**Ce que ça coûte.** La séquence trompeuse est complète et silencieuse : vérifications vertes, fusion
acceptée, branche supprimée, aucune erreur. Rien ne distingue « déployé » de « jamais parti » sans aller
regarder la liste des runs. Sur #696 le défaut corrigé était la grâce de #647, elle-même déjà livrée et
inopérante : **sans cette vérification, on aurait annoncé deux fois de suite une livraison qui n'avait pas eu
lieu**, la seconde en croyant réparer la première.

**La classe est plus large que le déploiement.** Tout correctif dont l'effet est de changer le comportement
d'un workflow — porte de release, préflight, porte de vulnérabilité, garde de concurrence — tombe dans le
même trou, puisque tous vivent sous `.github/**`.

## 📤 Dispatché

☑ 11/10 fiche écrite — **réparation NON entreprise, Avi arbitre l'ordre**

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**Rien n'est fermé ici.** Dette ouverte : la mesure est faite, la réparation ne l'est pas. Règle 16 — pas de
✅ sans la référence du test qui l'épingle, et ce test n'existe pas encore.

**La mesure, refaisable**

```bash
# les fichiers de la proposition
gh pr view 696 -R openaxcloud/vibecore --json files

# le filtre qui les couvre tous
git show origin/main:.github/workflows/deploy-main.yml | sed -n '/paths-ignore/,/^$/p'

# et le constat : aucun run pour le SHA de la fusion
gh run list -R openaxcloud/vibecore --workflow=deploy-main.yml --limit 5 \
  --json databaseId,headSha,status,event,createdAt
```

Environnement (règle 11) : `main` à `90c4049f62`, fusion de #696 à 05:36:24 UTC, aucun run `push` pour ce
SHA, run manuel `38115372477` créé à 05:37:16 UTC en `workflow_dispatch`.

## Réparation proposée

**Ne pas toucher au filtre.** Le retirer ramènerait les déploiements à vide de 2026-08-27, qui coûtaient 50 min
chacun sur un chemin sérialisé. La bonne réparation ne desserre rien : elle **rattrape le cas exact**.

1. **Un déclenchement automatique ciblé** : un petit workflow sur `push` vers `main`, filtré sur
   `paths: .github/workflows/deploy-main.yml` (et les actions composites qu'il appelle), dont le seul travail
   est de lancer `workflow_dispatch` sur `deploy-main.yml`. Il ne peut pas boucler : déclencher un
   déploiement ne modifie aucun fichier. Le coût est payé **uniquement** quand la chaîne de livraison
   elle-même change — c'est-à-dire rarement, et précisément quand il faut.
2. ⚠️ **À vérifier avant d'écrire la moindre ligne**, parce que c'est le genre d'hypothèse qui se paie :
   un `workflow_dispatch` émis par le jeton d'Actions ne redéclenche pas forcément un workflow (GitHub coupe
   certaines chaînes d'événements pour éviter les boucles). Si c'est le cas, la variante est un jeton d'appli
   dédié, ou — plus modeste et sans jeton — un **contrôle qui échoue** en disant « ce commit change la chaîne
   de livraison et aucun déploiement ne partira : lancez-le à la main », ce qui transforme un silence en
   consigne.

**Contre-épreuve exigée dans les deux sens** (règle 6) : un commit ne touchant que `deploy-main.yml` doit
produire un déploiement (ou un échec explicite) ; et un commit documentaire seul doit continuer à n'en
produire **aucun** — sinon on a réintroduit le coût que `paths-ignore` existait pour supprimer.

## Lien

Trouvée en livrant [BUG-HELM-REGLAGES-SECURITE-HORS-DEPOT](BUG-HELM-REGLAGES-SECURITE-HORS-DEPOT.md) et le
correctif #696 de la grâce de #647. Les trois défauts ont la même forme : **quelque chose est écrit, vert,
fusionné — et n'arrive pas en production.** Pour #647 c'était `--reuse-values`, pour #696 c'est
`paths-ignore`, et pour les quatre réglages de sécurité c'est l'inverse qui menace.

## Reprise du 11 octobre 2026

Correction préparée dans `fix/reprise-livraison-securite-20261011`. Tests de comportement et rendu Helm exécutés. Fusion et preuve de production encore attendues : aucun état ✅ ajouté.

Le workflow `deploy-chain-change.yml` appelle `workflow_dispatch` avec le SHA exact. Un déploiement push déjà présent pour ce SHA évite une seconde demande ; un run annulé ou échoué ne vaut pas livraison. Les erreurs de lecture et de déclenchement restent fatales. Exception GITHUB_TOKEN vérifiée dans la documentation officielle GitHub.
