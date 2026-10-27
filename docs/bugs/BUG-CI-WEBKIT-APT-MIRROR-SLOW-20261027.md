---
id: BUG-CI-WEBKIT-APT-MIRROR-SLOW-20261027
---

## Bug

**La préparation APT du canari WebKit consomme son budget avant les tests.** Sur main 0d6b2edfb, job 122264543142, téléchargements encore actifs après44 min 38 s via azure.archive.ubuntu.com ; annulation du job sans verdict WebKit. Les reprises existantes ne traitent pas un téléchargement lent qui continue.

## 📤 Dispatché

☑ 27/10/2026 — diagnostic et proposition CI séparée autorisés.

## 💻 Codé

☐ main — correctif local préparé, publication PR par le parent prévue ; pas fusionné. Sélection ciblée de l’archive Ubuntu officielle pour canari X64, paquets/signatures/tests conservés.

## ✅ Testé live

☐ —32 tests locaux de contrat verts, revue indépendante favorable ; gain de débit et canari réel après correctif non encore mesurés. Aucun job actif modifié.

## Preuve

[Diagnostic, logs, sources et validations](ci-webkit-apt-2026-10-27/README.md). Cause réseau ultime inconnue ; aucune promesse de gain avant CI comparative. Aucun timeout augmenté ni assertion affaiblie.
