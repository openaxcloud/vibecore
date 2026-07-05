# Instructions projet

## Règles

## Suivi (règle permanente)
Fichiers de suivi : `DESIGN_PROGRAM_MASTER.md` (points design — source de vérité unique ; specs détaillées dans `DESIGN_BATCH_*_SPEC.md`, état par point dans `DESIGN_AUDIT_LIVE.md`), `BUG_INVENTORY_LIVE.md` (bugs), `PLAN_REMAINING_UNIFIED.md` (plan), `REPLIT_PARITY.md` (parité Replit, fonctionnelle ET pixel).

**Design** — Dès qu'Avi donne des points « Claude design » (batchs A/B/C/D/E/F/G ou nouveaux), les ajouter IMMÉDIATEMENT dans `DESIGN_PROGRAM_MASTER.md`. La vérification d'un point design doit se faire EN RÉEL sur TOUTES les pages marketing ET user area, dans TOUS les formats web / tablette / mobile, en confirmant que la page s'adapte automatiquement au screen (responsive niveau Fortune-500). Un point design ne passe ✅ que si le responsive est validé sur les 3 formats.

**Bugs** — Dès qu'Avi envoie un bug, l'enregistrer IMMÉDIATEMENT dans `BUG_INVENTORY_LIVE.md`.

**Plan** — un point n'est ✅ que s'il est 100% surfacé ET marche en réel à 100%.

**Parité Replit** — suivi dans `REPLIT_PARITY.md` (parité fonctionnelle ET pixel). Un point n'y passe ✅ qu'après test réel live (à l'écran + greps) sur web / tablette / mobile — jamais sur « dispatché » ni « codé ».

**États** — chaque point des 4 fichiers de suivi (`DESIGN_PROGRAM_MASTER`, `BUG_INVENTORY_LIVE`, `PLAN_REMAINING_UNIFIED`, `REPLIT_PARITY`) trace **3 états séparés**, affichés côte à côte par point pour voir précisément où il en est :
- 📤 **Dispatché** — envoyé à une session
- 💻 **Codé** — commité + poussé sur `main`
- ✅ **Testé live** — vérifié à l'écran + greps, responsive web / tablette / mobile

Un point n'est « fait » QUE quand ✅ Testé live est coché ; 📤 Dispatché et 💻 Codé ne suffisent jamais.

**Règle commune** — Ne passer un point en ✅ QU'APRÈS test réel (vérif live à l'écran + greps de contrôle) — jamais sur « dispatché » ni « codé ». Quand Avi dit « fais-moi le point », TOUJOURS lire d'abord les 4 fichiers de suivi et dire précisément où ça en est.
