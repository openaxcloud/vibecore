---
id: BUG-E2E-WORKBENCH-TRANSITION-20261112
section: "Fiabilité E2E — transitions Workbench"
---

## Bug

Le hit-test de toolbar observe un View encore en translation horizontale, malgré toBeVisible. Run 43161939282, main 27850e74, 1180 px : troisième Webview échoué puis retry passé. Le PNG initial montre Webview vers x1035 ; les géométries verticales sont normales. La trace disponible appartient seulement au retry réussi : translateX(39.9897%), 2.1233%, 0.74039%, puis none au repos. L'identité exacte du nœud interceptant l'évaluation initiale n'a pas été enregistrée. Aucun défaut reproductible de header produit n'est établi.

## 📤 Dispatché

☑ Diagnostic 12/11/2026 et revue indépendante ; source exacte 27850e74, artefacts existants uniquement.

## 💻 Codé

☐ main ; candidat local observationnel 5 s, identité DOM figée ; aucune action pointer/scroll, aucun retry ajouté.

## ✅ Testé live

☐ Navigateur/CI/production en attente. 10 unitaires, typecheck strict ciblé et lint des quatre fichiers TypeScript passés. Les 10 cas Playwright sont découverts mais leur lancement Chromium local échoue avant les assertions : socket EPERM du sandbox. Aucun contournement ni test navigateur réussi revendiqué.

## Contrat du candidat

Attendre uniquement la matrice identité exacte du View propriétaire, enfant direct de workbench-view-viewport dans mobile-workbench-keepalive. Le callback capture les identités DOM et rejette disparition/reparentage/ancêtre incorrect ; la deadline indépendante du RAF reste 5 s. Une obstruction stable n'est jamais attendue ni supprimée : le hit-test instantané existant reste obligatoire après la garde. Géométrie, visibilité, clic et assertions de résultat sont conservés.

## Validation restante

CI réelle des 10 cas HTML locaux et du scénario existant 390/1180 ; confirmer header/overlay persistants rejetés par le hit-test, cible hors écran non scrollée, translation permanente expirée, cible disparue non remplacée. Le test unitaires jsdom ne constitue pas une preuve de layout navigateur. Conserver trace de première tentative si nouvel échec ; aucune hausse de retries/délais ou relaxation d'assertion.
