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

☐

## 💻

☐

## ✅

☐

## Preuve

Mesure prod (accueil) + mesure locale (soumission). Aucun test — point OUVERT.
