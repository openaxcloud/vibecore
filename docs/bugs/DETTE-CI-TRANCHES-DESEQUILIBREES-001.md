# DETTE-CI-TRANCHES-DESEQUILIBREES-001

**Nature** — DETTE, pas un défaut. **À ne pas traiter dans l'urgence.**

## Le fait, mesuré

Playwright découpe la suite **par FICHIER**, pas par durée. Les gros fichiers tombent donc
du même côté par hasard, et le déséquilibre est structurel — pas un accident de
configuration.

Mesuré le 2026-09-30 puis le 2026-10-01, sur deux tranches :

| mesure | tranche 1 | tranche 2 |
|---|---|---|
| durée de l'étape de suite | **27 min 47 s** | 10 min 33 s |
| fichiers de specs couverts | **44** | **4** |

Le rapport de **durée** est de 2,6 × ; le rapport de **fichiers** est de 11 ×. La tranche 2
tient quatre fichiers, dont aucun n'est lourd — elle finit en dix minutes et attend.

La conséquence s'est payée cette nuit : la tranche 1 a atteint le `globalTimeout` de 60 min
**à la seconde près** (3601 s) après l'ajout de sept specs, et la suite a été coupée. Le
passage à quatre tranches dilue le problème — chaque tranche porte la moitié — mais ne le
supprime pas : avec un découpage par fichier, un seul fichier très lourd peut encore
concentrer la charge.

## Ce qu'il faudrait faire

Répartir **par durée mesurée** plutôt que par fichier : conserver les durées par fichier
d'un passage sur l'autre (artefact ou cache), puis répartir les fichiers en équilibrant la
somme des durées — un simple « plus long d'abord » dans la tranche la moins chargée suffit
à passer d'un rapport de 11 × à moins de 1,2 ×.

## Pourquoi ce n'est pas fait aujourd'hui

Parce que ça demande un état qui survit entre deux passages, donc un cache à invalider
correctement, donc un nouveau mode de panne : un cache de durées périmé répartirait selon
l'ancienne réalité, et le symptôme serait exactement celui qu'on vient de corriger — une
tranche qui déborde. On ne remplace pas un déséquilibre connu par un déséquilibre qui
dépend d'un cache, à cinq heures du matin, après la nuit qu'on vient d'avoir.

## Ce qui protège en attendant

* le découpage à **quatre tranches** ;
* le contrôle de **couverture complète** dans `scripts/e2e-gate.mjs` : la porte refuse si un
  fichier de specs n'a été joué par aucune tranche, ce qui attrape aussi bien un
  dénominateur qui diverge que des specs ajoutés sans que la matrice suive ;
* le dénominateur de `--shard` **dérivé** de `strategy.job-total`, donc impossible à faire
  diverger ;
* le garde de budget (`tests/guards/budget-drain-deploiement.spec.ts`), qui rougit si le
  plafond du job ne couvre plus `globalTimeout` + préparation + canari.

**Mesure à refaire avant de se lancer** : les durées par fichier sur un passage à quatre
tranches. Le rapport de 11 × a été mesuré à deux tranches ; il faut connaître le nouveau
avant de décider si le chantier vaut son risque.
