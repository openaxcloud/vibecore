---
id: BUG-UX-CONFIRMATION-ESCAPE-REOPEN-001
---

# Escape parfois ignoré après réouverture d’une confirmation

## 📤 Dispatché

21 octobre 2026, revue de #759 : `snapshot-cancel-focus.spec.ts:121`, clavier FR. Le dialogue reste visible pendant les 5 secondes de l’assertion, puis le retry passe. Job 119297534323 du run 39621906313. Aucune causalité quota démontrée.

## 💻 Codé

Branche séparée de #758, base `736ed190d64a980471e5943cf7e0695195f2a691`. La confirmation traite localement Escape s’il n’a pas déjà été consommé, uniquement lorsque la cible appartient à son propre dialogue. Les dialogues imbriqués ne ferment pas le parent. Aucun changement BaseChat, délai, quota, protection ou tête #758.

Le fait reproduit est un Escape reçu par la confirmation visible et focalisée, mais non consommé par ses écouteurs. Le traitement Radix dépend de l’enregistrement de la couche et de son index mis à jour après montage ; cette lecture fournit une explication temporelle plausible, sans prétendre avoir mesuré ses variables internes dans la CI.

## ✅ Testé live

Local, build compilé attesté de la recette commune, pas production : test FR inchangé 10/10, puis sonde instrumentée 72 réussites avant un échec, sonde sans instrumentation 21 réussites avant le même échec. Dialogue `open`, bouton Annuler focalisé, assertion de fermeture inchangée à 5 secondes. Aucun appel de restauration.

Les [preuves](ux-snapshot-escape-2026-10-21/README.md) conservent le rouge CI et les deux rouges locaux. Correctif : sonde native 100/100, standard FR/EN 10/10 et trois formats 6/6, soit 420 réouvertures réussies sans retry ; focus restauré, zéro restauration. Aucune fusion autorisée de cette branche.
