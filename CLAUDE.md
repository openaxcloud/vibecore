# Instructions projet

## Règles

## Suivi des points « Claude design » (règle permanente)
Dès qu'Avi donne des points « Claude design » (batchs A/B/C/D/E/F/G ou nouveaux), les ajouter IMMÉDIATEMENT dans `DESIGN_PROGRAM_MASTER.md` (source de vérité unique du programme design). Ne passer un point en ✅ QU'APRÈS l'avoir testé en réel (vérif live à l'écran + greps de contrôle) — jamais sur « dispatché » ni « codé ». Specs détaillées dans `DESIGN_BATCH_*_SPEC.md`, état par point dans `DESIGN_AUDIT_LIVE.md`.

## Suivi (règle permanente)
Fichiers de suivi : `DESIGN_PROGRAM_MASTER.md` (points design), `BUG_INVENTORY_LIVE.md` (bugs), `PLAN_REMAINING_UNIFIED.md` (plan). Dès qu'Avi envoie un bug → l'enregistrer dans BUG_INVENTORY_LIVE. Dès qu'il envoie des points design → DESIGN_PROGRAM_MASTER. Ne passer un point en ✅ QU'APRÈS test réel (vérif live à l'écran + greps) — jamais sur « dispatché » ni « codé ». Pour le plan : un point n'est ✅ que s'il est 100% surfacé ET marche en réel à 100%. Quand Avi dit « fais-moi le point », TOUJOURS lire ces 3 fichiers d'abord pour vérifier s'il manque quelque chose.
