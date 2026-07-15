# DESIGN PROGRAM MASTER

Source de vérité des points design E-Code. Un point n'est terminé que lorsque les trois états sont prouvés séparément.

## Lot SOL-2026-07 — refonte des pages Solutions marketing

Spécification détaillée : `DESIGN_BATCH_SOLUTIONS_SPEC.md`. Validation live : `DESIGN_AUDIT_LIVE.md`.

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| SOL-01 | App Builder — page de vente complète centrée sur une app de réservation | ✅ | ☐ | ☐ | Page et responsive vérifiés localement le 2026-07-14 (23/23 Playwright, 16 captures inspectées). Validation globale laissée ouverte : les captures IDE réelles montrent encore le violet de la première génération et le run capturé utilise un adaptateur mémoire sans DB/auth/email externe. Attente de validation Avi. |
| SOL-01-IMG | App Builder — intégrer des visuels produit utiles (réservation, agenda, clients/rappels), propriétaires, accessibles et adaptés clair/sombre | ✅ | ☐ | ✅ | Historique : quatre SVG vérifiés techniquement, puis refusés comme gabarit par Avi parce qu'ils restent des illustrations. Remplacés par SOL-01-IMG-REAL. |
| SOL-01-IMG-REAL | App Builder — remplacer les schémas par des captures navigateur réalistes distinctes en anglais et français, avec sélecteur de langue persistant | ✅ | ☐ | ✅ | Vérifié le 2026-07-13 : quatre captures produit EN + quatre FR, deux OG localisées, sélecteur persistant, données fictives signalées, dimensions/alt/lazy-loading contrôlés et 16 captures de page sans image blanche ni artefact sticky. |
| SOL-01-IDE-PROOF | App Builder — montrer un vrai workspace E-Code avec prompt soumis, travail de l'agent, fichiers créés et application active dans l'onglet Preview | ✅ | ☐ | ✅ | Vérifié localement le 2026-07-14 : vrais workspaces EN/FR, prompts exacts, historique Agent réel, 24/22 fichiers et Webview Preview active ; réparation du routeur documentée, exports typecheck+build verts. Aucun composite. Limites DB/auth/email du run et données fictives signalées. |
| SOL-02 | Website Builder — page de vente complète centrée sur un site d'architecte | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-03 | Game Builder — page de vente complète centrée sur un quiz multijoueur | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-04 | Dashboard Builder — page de vente complète centrée sur un tableau de ventes connecté | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-05 | Chatbot / AI Agent Builder — page de vente complète centrée sur le support documentaire | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-06 | Internal AI Builder — page de vente complète centrée sur les procédures RH privées | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-07 | Enterprise — page de vente complète sous l'angle des équipes gouvernées | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-08 | Startups — page de vente complète sous l'angle fondateur/équipe produit | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-09 | Freelancers — page de vente complète sous l'angle livraison et transfert client | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
