# Audit légal local8999 — source inchangée

Routes présentes : `/privacy` → Privacy.tsx, `/terms` → Terms.tsx, `/support-policy` → composant dans sa route. Tout le travail reste dans /tmp, aucun fichier de #795 modifié.

## Couverture

48 géométries :3routes ×320/390/768/1440 ×FR/EN ×clair/sombre. Aucun enfant de main dépassant horizontalement de plus de1px, aucun pageerror ni mutation tentée. Captures pleine page à320/1440 dans chaque combinaison. Inspection visuelle ciblée Privacy FR clair320 ; les autres captures restent disponibles sans prétendre toutes inspectées pixel par pixel.

12 parcours :3routes ×FR/EN ×clair/sombre. Focus sur premier lien de main, Tab puis Shift+Tab, focus présent et box-shadow visible calculé ; centre du lien non couvert. Conservation du focus320→1440→390. Logo versAccueil puis Retour ramène URL et h1. Les liens mailto et `/support` n’ont pas été activés. Aucune ancre interne `href=#...` dans le contenu de ces pages ; les IDs de titres permettent toutefois des liens profonds.

## Défaut reproduit : liens profonds Privacy/Terms

Impact : ouvrir ou partager directement une section légale. Priorité modérée, sans blocage du parcours principal de lecture.

1. Nouveau contexte Chromium320 ou1440, ouvrir `/privacy?lang=fr#privacy-contact` ou `/terms?lang=fr#terms-contact`, attendre réseau et1,8s : scrollY=0, titre cible hors écran (y1344–2602).
2. Page montée, vider puis réassigner le hash : la cible arrive ày≈0 et est masquée par le header sticky110/111px.
3. Contrepreuve DOM seulement : marge haute de défilement=hauteurheader+16 puis scrollIntoView → titrey≈126/127 entièrement visible.

`anchor-counterproof.json` utilise un contexte neuf par cas et constitue la preuve concluante. Les premiers relevés `anchors-early.json` / `anchors.json` réutilisent la page et montrent des positions de scroll conservées entre routes ; ne pas les interpréter comme preuve de comportement à froid. Le titre support-policy-details-heading était sr-only et a été exclu du diagnostic visuel. Les fragments Support-policy ne sont pas conclusivement validés dans un contexte neuf ; aucun correctif proposé pour cette route.

Captures : `fresh-anchor-*`, `samepage-anchor-*`, `counterproof-anchor-*`. La capture samepage Privacy320 montre l’adresse mais aucun titre de section : le titre est sous le header, pas supprimé.

## Cause froide et proposition à revoir

`cause.json` contient réponseSSR et instrumentation du navigateur : ni h1 ni h2 cible dans le HTML serveur ; DOMContentLoaded519ms sans cible ; montage de cible898ms ; aucun appel scrollTo/scrollIntoView observé, scrollY final0. Root.tsx714–762 garde ClientOnly pour les routes sans handle.serverRenderedMarketing. Privacy etTerms n’exportent actuellement aucun handle. Cela explique le fragment absent au passage initial ; aucun reset tardif n’a été observé dans ce cas.

`proposed-legal-anchors.patch` est **non appliqué, non construit, non validé**. Quatre fichiers seulement : export du handle SSR existant dans routes/privacy.tsx et routes/terms.tsx, puis `scroll-mt-36` sur les h2 de Privacy/Terms. Aucun hook, root, routage commun, style global ou contenu légal modifié. Le handle est déjà utilisé dans routes/solutions.app-builder.tsx. La marge9rem=144px laisse33px minimum au-delà du header observé. `header.json` mesure FR/EN :111px à320,65px à390,110px à768/1440, racine16px. La marge suit la taille du rem ; ce n’est pas une preuve pour tous les facteurs de zoom/annonces futures.

Inspection SSR : Privacy/Terms n’accèdent à aucun global navigateur ; catalogues/date sont déterministes. Les globals de EcodeExactShell sont dans effets ou événements ; announcementDismissed démarre false pour serveur/client. EcodeExactUi garde la lecture document, thème/cookies ont des gardes serveur ; LanguageSwitch utilise window seulement dans le gestionnaire utilisateur. Footer useFetcher nécessitera le vrai contexte route SSR fourni par root. Aucun obstacle SSR direct trouvé ; cette lecture ne remplace pas un rendu serveur et la vérification d’hydratation.

## Validation à exécuter après revue et build consolidé

- Réutiliser `app/lib/i18n/catalogs/marketing-exact-privacy-terms.spec.tsx` pour les textes, métadonnées, dates et rendu existants.
- Contrôler le HTML brut réel :h1 et ID de section présents en FR/EN, sans erreur serveur. Une simple assertion du handle ne suffirait pas.
- `acceptance-after-build.cjs` préparé, syntaxe vérifiée mais **non exécuté** :32casPrivacy/Terms ×FR/EN ×thèmes ×4largeurs, réponseSSR, cible visible après chargement froid/hash/Retour, erreurs d’hydratation et mutations absentes.
- Lint/typecheck/build consolidés du propriétaire avant toute publication ; inspection de captures320/1440 et cas zoom200% ciblé ensuite. Pas de nouveau build lancé par cet audit.

## Restant et limites

Support-policy géométrie/clavier/Retour couverts, fragments non conclusifs ; `/legal`, autres textes légaux (DPA, sous-traitants, utilisation acceptable…), autres pages marketing et docs restent hors de ce lot. Pas de mesure de contraste pour ces3pages, pas de zoom200%, paysage, clavier virtuel/safeareas physiques. Aucun lien externe, envoi, authentification, backend réel ou production. Tous les navigateurs terminés. Aucun correctif déclaré livré.


## État après adoption et build9599

La section de proposition ci-dessus décrit le diagnostic historique8999. Le propriétaire a depuis adopté le patch dans vibecore-ui-org. [Validation après adoption](after9599/README.md) :16tests existants verts, lint4fichiers0,32casSSR/ancres/Retour et4caszoom natif200% réussis. Aucune source supplémentaire modifiée pendant la recette ; navigateurs fermés. Ces résultats restent locaux, sans validation production ni livraison revendiquée.
