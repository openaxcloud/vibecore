# Validation après adoption — build local9799

Source gelée dans vibecore-ui-org, trois fichiers concernés par ce complément. Build consolidé et typage annoncés réussis par le propriétaire avant GO9799. Aucun autre changement source par cet agent. Hash sources archivés.

## Résultats exacts

- 14 tests existants réussis :7 marketing-exact-support-policy.spec.tsx,7 EcodeProductMarketingPages.spec.ts.
- Lint des trois fichiers concernés code0, sans sortie.
- Support-policy :16 cas FR/EN ×clair/sombre ×320/390/768/1440, hauteur900. La réponseHTML contient désormais h2#support-policy-cta-heading dans16/16cas. Cible entièrement visible sous header après chargement froid du fragment, changement de hash et logo→Accueil→Retour. Écart minimal titre/header17,5px, y compris après Retour. Aucune erreurJavaScript ou d’hydratation observée, aucune mutation tentée.
- Features :4groupes FR/EN ×clair/sombre à320. Six filtres activés au Space ; assertion exactement un aria-pressed=true après chaque action et focus restant sur le bouton activé. Comptes de cartes13/5/1/4/2/1, identiques à avant. Dernier filtre/compteur/focus conservés au passage1440 puis320. Aucune erreurJavaScript ou d’hydratation observée, aucune mutation tentée.

8captures Support après Retour à320/1440 et4captures Features après dernierfiltre/resize. Inspection visuelle ciblée Support FRclair320 : titre auparavant masqué désormais visible, actions présentes. Le changement ARIA est vérifié auDOM et par assertions, pas par sa capture. Les reçus et scripts montrent chaque état. Tous les navigateurs fermés.

## Preuves et reproduction

`after-support.json`, `after-features.json`, scripts correspondants, sorties code0 dans *-run.txt. Tests etlint dans adopted-*.txt. Depuis un dépôt avec dépendances : `NODE_PATH=$PWD/node_modules UI_BASE_URL=http://127.0.0.1:9799 node chemin/after-support.cjs` puis after-features.cjs. Scripts exigent URLlocale, bloquent mutations et requêtes tierces, écrivent dans /tmp/ui-audit-next-marketing (à créer avant). Les captures/reçus9599 sont le diagnostic avant et ne doivent pas être additionnés comme nouveaux cas uniques.

## Limites explicites

La correction Support concerne seulement le fragment CTA reproduit. Autres fragments Support non validés/corrigés par cette recette. Aucune nouvelle recette deLegal, Privacy/Terms, AI Agent ou autres pages marketing sur9799. Aucun zoom200% pour ce complément, ni contraste calculé, lecteurécran réel, Firefox/Safari, clavier virtuel/safeareas physiques. Les blocs de code Features restent des exemples marketing existants défilants, pas des tests de l’IDE réel. Les actions Support/Docs ne sont pas activées ; aucune transmission, authentification, backend réel ou production. Aucune fusion, publication ou livraison revendiquée par cet agent.
