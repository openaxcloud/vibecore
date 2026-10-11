---
id: BUG-QA0928-PROMPT-TRONQUE
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**GÊNANT — une idée de plus de 8 000 caractères saisie sur l'accueil est tronquée en silence, puis soumise automatiquement.**

Le champ de l'accueil n'a pas de `maxlength` et ne prévient pas. Le relais vers `/projects/new`
coupe à `PROMPT_MAX_CHARS` (8 000) et soumet sans afficher la coupe : la **fin** du cahier des
charges — souvent les exigences les plus précises — disparaît.

Code : `app/routes/projects.new.tsx:816` `stashedPrompt.trim().slice(0, PROMPT_MAX_CHARS)` ;
le composeur de `/projects/new` porte bien `maxLength` (`:1151`), l'accueil non.

## Repro

```sh
# Production, sans compte : ce que l'accueil accepte et relaie
node docs/bugs/qa-2026-09-28/repro-prompt-long-accueil.mjs
# → {"saisi":12000,"accepteParLeChamp":11999,"maxLength":null,"relayeEnSessionStorage":11999,"avertissementAvantEnvoi":false}

# Local (build de prod, compte de test) : ce que /projects/new soumet
node docs/bugs/qa-2026-09-28/fixture-local.mjs
node docs/bugs/qa-2026-09-28/repro-prompt-long-troncature.mjs
# → {"longueurRelayee":11999,"longueurSoumise":8000,"finConservee":false,"avertissementVisible":false}
```

## Correctif suggéré

Même plafond et même compteur sur le champ de l'accueil que sur le composeur ; à défaut, ne pas
auto-soumettre une idée tronquée — la présenter pour relecture.

## 📤

☑ 30/09 #612

## 💻

☑ 30/09 fusionnée `01311dbeb`

## ✅

☐ pas encore servi en prod au 30/09 13:45

## Preuve

Mesure prod (accueil) + mesure locale (soumission). Aucun test — point OUVERT.

**30/09 — PROUVÉ, pas encore servi.** Vert en CI (3 requis, 1re tentative, les deux tests du défaut ✓, rapport présent). Épinglé par `tests/e2e/prompt-long-pas-tronque.spec.ts`. Combiné avec #611 dans `projects.new.tsx` : relu après fusion, lecture datée puis garde de longueur sans coupe.
**Cas voisin NON-DÉFAUT** : le chargeur coupe encore `?prompt=` à 8 000 caractères (`projects.new.tsx`, `requestedPrompt.trim().slice(0, PROMPT_MAX_CHARS)`). Ce chemin ne fait que PRÉ-REMPLIR le champ (jamais d'envoi automatique) et exige une URL de plus de 8 000 caractères, au-delà des tampons d'en-tête par défaut d'ingress-nginx. Pas de correctif.
