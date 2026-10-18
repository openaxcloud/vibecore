# Problèmes et reprise des sessions

Point d'entrée documentaire, préparé le 12 octobre 2026 depuis main `7ce2aa9ceac014b2449d053e3991baeaea9f427d`.
Ce fichier n'est pas un second registre de statuts.

## Lire les sources de vérité

- [Vérification avant commercialisation du 18 octobre](docs/reprise/2026-10-18-commercialisation.md) : relevé actuel de main, CI et livraison, accès production limité, défaut de ressources reproduit et conditions de lancement encore non prouvées.
- [Inventaire de reprise du 11 octobre](docs/reprise/2026-10-11-inventaire.md) : conserver les 71 entrées A-1–A-35 et B-1–B-36, leurs preuves et leurs réserves.
- [Complément de périmètre et priorités](docs/reprise/2026-10-12-complement-inventaire.md) : A-36/A-37, B-4bis, C à F et ordre P0–P4 ; les observations anciennes ne valent pas vérification actuelle.
- [A-37 : compilation locale revalidée](docs/reprise/2026-10-12-a37-compilation-locale.md) : défaut actuel du wrapper HMR reproduit ; aucune clôture du parcours génération/publication live.
- [A-37 : suite CommonJS et galerie](docs/reprise/2026-10-12-a37-commonjs-et-galerie.md) : compilations locales, versions restaurées et six diagnostics globaux exacts ; parcours live toujours ouvert.
- [Typecheck : dérive des dépendances restaurées](docs/reprise/2026-10-12-typecheck-dependances.md) : attribution des six diagnostics par contre-épreuves ; restauration conforme au lockfile encore requise.
- [A-37 : restauration hors ligne isolée](docs/reprise/2026-10-12-a37-restauration-offline.md) : typecheck global et 72 tests verts sur graphe revérifié ; correctifs de l'outillage d'audit, limites live inchangées.
- [A-37 : prérequis des six échecs de galerie](docs/reprise/2026-10-12-a37-galerie-prerequis.md) : sources inchangées, dépendances requises absentes de la copie conforme ; aucun défaut intrinsèque établi ni compilation actuelle revendiquée.
- [Bugs](BUG_INVENTORY_LIVE.md) : index dérivé des fiches dans `docs/bugs/`, jamais à modifier à la main.
- [Programme design](DESIGN_PROGRAM_MASTER.md) et [audit design](DESIGN_AUDIT_LIVE.md) : exigences et preuves visuelles.
- [Plan restant](PLAN_REMAINING_UNIFIED.md) et [parité Replit](REPLIT_PARITY.md) : plan fonctionnel et visuel.
- [Journal des fusions](SERVI-POUR-LES-SESSIONS.md) : une ligne par fusion, date UTC, SHA, fichiers et limites de preuve.

Les quatre registres canoniques restent BUG_INVENTORY_LIVE, DESIGN_PROGRAM_MASTER, PLAN_REMAINING_UNIFIED et REPLIT_PARITY. Pour un nouveau défaut confirmé, compléter sa fiche source puis régénérer l'index par l'outil du dépôt. Pour un nouveau point design, compléter la source design. Le complément conserve les demandes et critères manquants sans recopier leurs statuts.

Préparé, validé en CI au SHA exact, fusionné sur main, déployé et testé live sont des étapes distinctes. Aucun succès documentaire n'atteste un parcours client réel.
