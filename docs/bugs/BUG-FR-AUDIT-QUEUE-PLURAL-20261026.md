---
id: BUG-FR-AUDIT-QUEUE-PLURAL-20261026
---

# Faux positif « files d’attente » dans l’audit français

Dispatché ☑ ; intégré main ☐ ; testé production ☐. Correctif local du détecteur d’audit, pas modification du produit.

La phrase Blog « Utiliser des files d’attente pour les traitements longs » est rejetée comme forbidden-term par les auditsFR desktop1024/tablet768. L’exception existante autorise seulement le singulier français. Delta : ajouter s? au mot file dans cette expression complète, sans autoriser files ailleurs.

[Preuves CI, rouge→vert et limites](ui-fr-queue-audit-2026-10-26/README.md).4rouges avant ;112tests ciblés verts après, lint/format/typagescopé verts. Guardsanglais maintenus. Pas de modification Blog/workflow/waiver/skip/testE2E. Revue parent et auditCI complet après intégration restent requis ; aucun build produit nécessaire pour cet outil seulement importé par les tests.
