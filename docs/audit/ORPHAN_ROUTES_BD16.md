# BD-16 — routes « orphelines » : disposition documentée

Vérifié sur origin/main `722a224c` (2026-08-12). Aucune des quatre routes n'est du code mort : chacune rend un contenu réel. Disposition tracée ci-dessous (clôture = liste vérifiée).

| Route | Fichier | Disposition | Justification |
|---|---|---|---|
| `/help` | `app/routes/help.tsx` | **Alias** de `/help-center` | Rend `MarketingStaticPage page={marketingPages['help-center']}` (même contenu, même meta). `/help-center` est lié dans la nav marketing (Ressources) ; `/help` est un raccourci canonique volontaire (cf. BOLT_SURFACING_STATUS §220). |
| `/marketplace/templates` | `app/routes/marketplace.templates.tsx` | **Alias** de `/templates` | Pur re-export `export { default, loader, meta } from './templates'`. `/templates` est la surface canonique (liée depuis le dashboard) ; l'alias sert d'URL parlante. |
| `/mobile-workspace/:projectId` | `app/routes/mobile-workspace.$projectId.tsx` | **Deeplink SEO réel** (volontairement hors nav primaire) | Vraie page (`loader` + `meta` OG + `MobileWorkspacePage`), atteinte par lien externe / QR / partage mobile — pas une entrée de menu par nature. |
| `/search` | `app/routes/search.tsx` | **Utilitaire réel** (volontairement hors nav primaire) | Vraie page de recherche (`loader` + `SearchRoute` avec résultats). Surface utilitaire atteinte par URL directe / affordances de recherche, pas une entrée de menu (déclarée volontaire, BOLT_SURFACING_STATUS §220). |

**Conclusion** : zéro route orpheline **non documentée**. Deux alias de routes canoniques liées, deux surfaces réelles volontairement hors nav primaire (deeplink SEO + utilitaire de recherche). Aucune suppression ni relien requis.
