# Vérifier l'existant avant d'ÉCRIRE, pas avant d'ouvrir la PR

**Règle.** Avant d'écrire la première ligne d'un correctif, vérifier que le
travail n'existe pas déjà — dans `main`, dans une PR ouverte, ou dans une
branche poussée. La règle 8 du projet dit « chercher s'il existe déjà une PR » ;
elle est appliquée trop tard si on la lit au moment d'OUVRIR la PR.

## Deux cas le même jour, 2026-09-04

**Matin — la pastille de descente (BUG-UX-021).** J'allais sortir la pastille de
la colonne de lecture. Le correctif était déjà dans `main` : `margin-inline-end:
12px` plus une gouttière réservée de 64 px. La production servait encore
`margin-inline:auto` parce qu'elle avait 30 commits de retard. Le défaut se
reproduisait parfaitement en production — 100 points sur 100 posés sur du texte
— et **cette reproduction ne prouvait rien sur `main`**.

**Soir — l'échelle typographique (item 2).** J'avais écrit le bloc SCSS complet
quand un `git checkout -b` est retombé sur une branche existante,
`fix/agent-panel-type-scale`, et j'ai vu passer un HEAD que je n'attendais pas.
C'était la PR #428, ouverte, testée, qui traitait **les trois** libellés à 9 px
alors que ma mesure n'en avait trouvé qu'un — les deux autres n'étaient pas
rendus dans l'état que j'observais. J'ai annulé mon travail.

Vérification faite ensuite sur les six points demandés : **quatre avaient déjà
une PR ouverte** (#428, #409, #387, #417), aucune fusionnée.

## Ce que ça coûte quand on ne le fait pas

Du travail en double, et pire : une **divergence**. Deux corrections du même
défaut, écrites séparément, produisent deux conflits sur le même fichier — et
c'est exactement ce qui bloquait la file. Les trois PR en conflit l'étaient
toutes sur `app/styles/index.scss`, au même endroit.

## Le geste, dans l'ordre

1. `git log origin/main -- <fichier>` — le correctif est-il déjà fusionné ?
2. `gh pr list --state open --search "<sujet>"` — quelqu'un l'a-t-il déjà écrit ?
3. `git branch -r | grep <sujet>` — une branche poussée mais sans PR ?
4. **Puis seulement**, écrire.

## Le corollaire, qui compte autant

**Reproduire un défaut en production ne dit rien de l'état de `main`.** Sur un
dépôt où vingt correctifs attendent le déploiement, « je l'ai vu en réel » et
« il n'est pas corrigé » sont deux affirmations différentes. Vérifier laquelle
on tient avant d'écrire une ligne.
