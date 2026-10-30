# Menus mobiles et restitution du focus palette — 30 octobre 2026

Base examinée : `bd5e0f5ea87767849d266b031b13fe4ae2e0967a` (main après #856). Les correctifs sont locaux, non publiés et non validés en production à ce point. Toutes les recettes utilisent Chromium local et des données synthétiques isolées. Aucun accès Aster, fournisseur IA, secret, données client ou nouvelle ressource.

## Deux mécanismes distincts

### Chrome mobile : disparition temporaire du bouton

- `mobile/baseline-gap/receipt.json` : **3/3 échecs reproduits**, Tools390, Tabs820 et Tabs1180, CPU×4. Après détachement du bouton initial, la nouvelle coque est présente sans les déclencheurs ; un seul Enter natif atteint BODY. Le bouton revient ensuite mais la feuille ne s’ouvre pas sous 5 s.
- `mobile/baseline-stable` : **3/3 témoins verts** après stabilisation et refocus explicite. Ce scénario distinct prouve que le bouton accepte Enter, pas que la course est corrigée.
- `mobile/baseline-navigation` : **3/3 témoins verts** après navigation vers un nouveau document/projet. Pas une preuve d’interruption SPA pendant le gap.
- `mobile/fixed-gap-1`, `fixed-gap-2`, `fixed-gap-3` : **9/9 passages corrigés sans reprise**, trois contextes indépendants par format. Même protocole natif, pas de refocus ni attente de visibilité du nouveau bouton avant Enter. Le nouveau bouton est présent et focalisé lors du témoin de détachement ; la feuille s’ouvre, Escape ferme et restitue le focus.
- `mobile/fixed-stable` : **3/3 verts**. Navigation corrigée vers un nouveau document **3/3** et zoom navigateur natif200% **3/3**, tous sans reprise. Au zoom, viewports CSS195×422,410×450,590×378, DPR2/CSSzoom1 : activation/focus validés, pas certification complète de géométrie. Les navigateurs sont fermés, aucun profil résiduel, serveur parent préservé.

Le correctif remplace la readiness locale réinitialisée à false par `useHydrated`, sans file d’événements ni rejeu d’action. Le témoin réduit readiness compte4tests, dont SSR et isolation de scope. Les warnings connus useLayoutEffect du harnessSSR restent explicités dans la note source ; absence d’erreur récupérable dans cette fixture n’est pas certification de toute l’application.

### Palette desktop : reçu consommé avant la frame

- `palette/baseline1440` et `baseline1440cpu4` : **2/2 parcours ordinaires verts**. L’ordre CI attend le remplacement avant Escape ; son échec intermittent n’est pas reproduit et sa cause reste inconnue.
- `palette/close-before-remount` impose un ordre différent : Escape puis remplacement avant la frame. Focus sur BODY reproduit. Cette course forcée est un défaut distinct, pas la cause certifiée du retry CI.
- `palette/compiled-summary.json` : **7/7 passages corrigés sans reprise** : course forcée dans trois contextes, ordre ordinaire CPU1/CPU4, cible extérieure avant frame et réouverture avant frame. Reçu conservé jusqu’à la tentative effective, sans vol du focus extérieur ni restauration périmée après réouverture.
- Les premiers essais `normal`/`cpu4` avant disponibilité du serveur échouent par connexion refusée ; erreurs de préparation conservées, pas bugs produit.

Les scripts s’arrêtent après l’assertion ciblée : les trajets Database/navigation situés après leur `continue` ne sont pas exécutés et ne comptent pas comme couverture. Les captures corrigées palette sont **avant fermeture** ; le verdict après fermeture vient des assertions et du ledger de focus. Aucune fausse comparaison visuelle avant/après du même état.

## Validations et limites

Parent : **65 tests ciblés**, typage officiel complet, build client/SSR, lint 0 erreur / 52 avertissements préexistants, typage E2E verts. Revue indépendante 46 tests favorable. Les suites se recouvrent : ne pas additionner les comptes. `unit-verdicts.json` conserve les résultats et SHA des logs sources : readiness 4 verts, témoin produit 1 rouge / 3 ignorés, ensemble produit 23 verts, palette 4 rouges / 25 verts avant correction puis 29 verts. Aucun journal brut n’est copié.

Le nouveau test E2E strict retient une vraie réponse API puis attend le détachement initial et envoie un seul Enter natif ; il a été typé et relu. **Pas d’E2E complet backend réel local exécuté** pour ce lot ; CI à venir. La navigation navigateur exercée ci-dessus change de document, elle ne valide pas une interruption SPA dans la fenêtre critique.

Aucune certification 31/31, Safari physique, clavier virtuel réel ou safeareas matérielles. La course mobile est prouvée localement, mais tous les retries CI ne lui sont pas attribués. La cause du retry palette1440 et #834 restent ouvertes. Aucun statut de fusion ou livraison n’est déduit de ces recettes.

## Intégrité et captures

Scripts, notes sources et captures sélectionnées sont copiés octet pour octet ; JSON compactés uniquement, toutes les valeurs préservées. Le manifeste donne SHA source/copie et transformation. Le rapport commun prime pour l’état actuel sur les notes sources historiques. Aucun profil Chromium, cache, environnement brut ou cookie réel archivé. Les identifiants synthétiques présents dans les scripts ne constituent pas des accès réels. Le manifeste est recalculé après la dernière édition de ce rapport.

## Correction du conditionnement CI

Sur la tête `a608cabd`, Vitest découvrait trois contre-épreuves historiques archivées avec l’extension `.spec.tsx` : leurs imports absolus locaux échouaient sur le runner. Le job 123919326719 compte 11 312 tests réussis, 4 ignorés et 3 suites non chargées. Ces scripts sont conservés octet pour octet sous `.spec.tsx.txt`, avec leurs chemins sources historiques dans le manifeste. Pour reproduire les expériences originales, copier les archives hors du dépôt sous leur nom source et adapter les chemins au banc isolé ; le témoin ancien est intentionnellement rouge.

Aucune configuration de découverte ni assertion n’est assouplie. Les tests permanents `MobileOverlayFocus.hydration.spec.tsx`, `IdePaletteState.spec.tsx` et les trois nouveaux cas E2E restent exécutables et inchangés.
