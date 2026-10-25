# Intégrations et parcours — reprise du 25 octobre 2026

Référence examinée : main `941d7d7fc` (#780), après lecture des PR ouvertes. #764 et #768 ne sont pas intégrées par ce travail ; aucune opération les concernant. Restauration et moteur Debugger appartiennent à des sessions distinctes et restent hors périmètre. Instruction complémentaire du parent : Git, Publish/Déploiement et Domains sont réservés à une nouvelle session ; aucune de leurs sections n’est modifiée ici.

## Provenance et méthode

Reprise de `BUG_INVENTORY_LIVE.md`, `PLAN_REMAINING_UNIFIED.md`, `DESIGN_PROGRAM_MASTER.md`, `REPLIT_PARITY.md`, `docs/IDE_PANEL_AUDIT.md` et des preuves du 23 octobre. Le résultat historique 81/81 de l’audit des panneaux ne certifie pas leurs opérations métier. Certaines descriptions sont dépassées : Database utilise DatabaseWorkbench, Packages exécute et contrôle ses commandes et Extensions utilise `/mcp/installs`.

Les corrections #776–780 restent acquises sur main sans transférer leurs résultats à une nouvelle version déployée. La fiche Sync dit encore « non fusionné » alors que son refus explicite est présent sur main ; cette incohérence documentaire est corrigée dans ce lot.

## Manques confirmés dans les sources

| Priorité | Surface et comportement actuel | Preuve sur main | Suite nécessaire |
|---|---|---|---|
| P1 | Terminal, Packages et Workflows acceptent un code absent comme réussite | BFF `runTerminalCommand`, `runPackageInstall` ; `app/lib/ide-panel-workflows.ts` | Correction et tests dans ce lot ; CI/revue avant intégration |
| P1 | Security masque des erreurs audit/grep avec `|| true` | BFF `runSecurityScan` | Préserver les erreurs réelles et distinguer les findings npm exit 1 d’une panne |
| P1 | Sync du hub n’a pas d’exécuteur | BFF integrations, `INTEGRATION_SYNC_UNAVAILABLE`, capacité false | Définir et raccorder les opérations de chaque fournisseur, autorisation, suivi et reprises ; ne pas réactiver le bouton sans moteur |
| P1 | Webhooks du hub : configuration persistée, aucun transport identifié | `VIBECORE_INTEGRATIONS_STATE`, `INTEGRATION_WEBHOOK_SECRET_*` | Relier événements, file de livraison, signature, anti-SSRF, reprises et reçus ; tester endpoint synthétique |
| P1 | Clés API du hub : création/stockage sans consommateur auth identifié | `INTEGRATION_API_KEY_*` créé/supprimé uniquement dans le BFF | Raccorder validation, périmètres, expiration et révocation à une vraie API |
| P1 | Event streams : active=true et throughput=0 sans worker identifié | BFF integrations, actions create/toggle/delete-event-stream ; BaseChat liste destination/débit | Définir transport et abonnement, consommation réelle et métriques |
| P2 | Connect du hub écrit connected/active sans validation fournisseur | BFF integrations, intent connect | Raccorder les adapters existants et distinguer configuration/connexion vérifiée |

Les recherches de consommateurs portent sur `app`, `services`, `packages` : elles ne prouvent pas l’absence d’un service externe non versionné. Les adapters OAuth/API-key existants sont distincts du hub ; leur existence ne prouve ni Sync ni livraison. Les commandes d’audit du panneau Packages, distinctes du scanner Security, gardent leurs `|| true` historiques : reliquat à traiter séparément.

## Matrice création → exécution → publication

Ces preuves historiques utilisent des données synthétiques. Aucune recette production n’a été exécutée pendant cette reprise ; elle attend la reconnexion E-Code. Aucun compte, secret, paiement ni ressource fournisseur créé.

| Étape | Desktop | Mobile/tablette | Safari/WebKit | Preuve et limite |
|---|---|---|---|---|
| Création/import → IDE | Import ZIP local réel historique | Transitions UI 390/1180 historiques ; pas génération fraîche complète | Non certifié | `../panel-visibility-2026-10-23/README.md` |
| Terminal/Workflows | Runtime local réel historique : exit 7 → failed | Exécution mobile non certifiée | Non certifié | `../panel-outcomes-2026-10-23/README.md` : 5 succès/1 échec de sélecteur puis reprise ciblée verte ; pas un run unique 6/6 |
| Security | Scan réel local completed historique ; erreurs UI injectées séparément | Non certifié | Non certifié | Même preuve ; nouvelles commandes shell synthétiques dans ce lot, pas moteur distant |
| Intégrations | Configuration/reload locaux réels, aucun fournisseur | Recette historique EN1440/FR820/FR390 | Non testé | `../BUG-INTEGRATIONS-SYNC-FALSE-SUCCESS-001.md` ; Sync 503 |
| Publication → URL utilisable | Application fraîche jusqu’à interaction sur URL publiée à rejouer | Non certifié actuellement | Non certifié actuellement | `../../reprise/2026-10-12-complement-inventaire.md`, A-37/D |

Desktop signifie navigateur de bureau lorsque la preuve ne mentionne pas Electron. Chromium à largeur mobile ne vaut pas Safari sur iPhone. Aucun verdict global « tous parcours passent » ne se déduit des tests locaux. GitHub confirme le workflow de déploiement de main `941d7d7fc` réussi : [run 40010684339](https://github.com/openaxcloud/vibecore/actions/runs/40010684339). Cela atteste le résultat du pipeline, pas une nouvelle inspection du SHA servi ni une recette applicative. Les checks Playwright @runtime non bloquants de ce SHA sont rouges malgré le statut global vert de leur workflow ; ils ne valent pas une validation runtime.

## Autres reliquats historiques à revalider

- Publication fournisseurs : credentials/configuration et recette externe restent nécessaires (`DESIGN_PROGRAM_MASTER.md`).
- Pause, changement de type, dépublication et copie DB dev→prod : manques décrits dans `REPLIT_PARITY.md`, réinspection API requise avant correction.
- Git push/pull, DNS, totalité des panneaux/boutons, 48 routes authentifiées et Safari iPhone : preuves séparées encore nécessaires.
- Restauration et moteur Debugger : à consolider avec les deux sessions propriétaires, sans modifier leurs fichiers ici.

L’absence d’accès de recette E-Code bloque la vérification production ; elle ne valide ni n’invalide automatiquement ces parcours. Les tests de transport contrôlé ne remplacent pas des échanges fournisseurs réels.
