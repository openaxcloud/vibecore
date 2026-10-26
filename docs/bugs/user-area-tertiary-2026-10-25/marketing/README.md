# Complément public local9599 — audit figé, aucune source modifiée

Routes inspectées au code : `/legal` utilise Legal.tsx ; `/features` utilise **EcodeFeaturesPage dans EcodeProductMarketingPages.tsx**, pas l’ancien pages/Features.tsx. `/support-policy` utilise son composant de route. Le groupe marketing choisi est uniquement Features ; AI Agent non testé.

## Matrice et résultats

| Périmètre | Combinaisons | Résultat |
| --- | --- | --- |
| Legal + Features géométrie | 2routes ×320/390/768/1440 ×FR/EN ×clair/sombre =32 | Legal aucun dépassement ; Features2CODE dépassent les coordonnées du viewport à320 dans chaque langue/thème, mais restent dans des PRE défilants |
| Legal + Features clavier/resize/Retour | 2routes ×FR/EN ×clair/sombre =8 | focus premier lien de main, Tab/Shift+Tab,320→1440→390 conserve focus, logo→Accueil→Retour réussi |
| Support-policy fragment CTA | 320/390/768/1440 ×FR/EN ×clair/sombre =16 contextes neufs | cible absenteHTMLserveur16/16 ; chargement froid cible horsécran16/16 ; hash page montée titre sousheader16/16 |
| Features filtres clavier | FR/EN ×clair/sombre à320 =4parcours | six boutons viaSpace :13,5,1,4,2,1cartes ; dernierfiltre conservé aprèsresize1440→320 ; état actif non exposé parARIA |

Reçus `receipt.json`, `support-fragments.json`, `features-controls.json`. Aucune erreurJavaScript ni mutation tentée dans ces reçus. Tous les navigateurs fermés. Pas de lien externe activé ni de soumission. Captures pleine page Legal/Features320/1440, filtres et fragmentSupport-policy disponibles. Inspection visuelle ciblée FeaturesFRclair320 et fragmentSupport-policyFRclair320 ; ne pas prétendre inspection pixel de toutes les captures.

### CODE Features : pas de défaut de débordement confirmé

Les deux PRE font252px de largeur, contenu304px et scrollLeft atteignable52px, overflow-x:auto. La première zone PRE est atteignable au Tab après le lien Documentation. Le CODE dépasse géométriquement jusqu’à321,53px mais est contenu dans le scroller, le document reste320px. Pas de correction proposée sur cet exemple marketing existant. Ce n’est pas une preuve du fonctionnement de l’IDE réel.

## Deux défauts reproductibles et propositions non appliquées

### Support-policy : lien profond

Ouvrir `/support-policy?lang=fr#support-policy-cta-heading` dans un contexte neuf320 : scrollY0, cibley3693,56 ; puis réassigner le hash une fois la page montée : cibley−0,44, header111px, titre masqué. Équivalent observé dans les16cas. Aucun lien de fragment interne n’est fourni sur cette page ; impact des liens profonds partagés.

La réponseHTML ne contient pas la cible. Comme les routes légales avant correction, la route ne possède pas le handleSSR ; **en plus**, SaaSLayout.PublicShell ne rend aucun enfant tant que son useEffect n’a pas chargé la coquille. Ajouter seulement le handleSSR ne suffirait pas. `proposed-support-policy.patch` vise uniquement app/routes/support-policy.tsx : importer directement EcodeExactPublicShell sous alias PublicShell (la même coquille finale), handle serverRenderedMarketing et scroll-mt-36 sur le CTA reproduit. Aucun root/SaaSLayout/styleglobal modifié. Les autres titres/ancres de Support-policy ne sont pas déclarés corrigés par cette proposition ciblée.

Le test existant mocke l’ancien import. `proposed-support-test-adapter.patch` adapte uniquement le mock dans app/lib/i18n/catalogs/marketing-exact-support-policy.spec.tsx à l’import réel. Ce mock ne valide pas leSSR : il faut aussi le vrai HTML du prochainbuild et une recette de fragment froid/hash/Retour. Ces patches ne sont ni appliqués, ni construits, ni testés.

### Features : état actif non exposé

Les six boutons de catégorie changent réellement les cartes au Space, mais aria-pressed et aria-selected restent absents pour chacun, avant/après sélection. Le style indique la catégorie active visuellement ; son état n’est pas exposé sémantiquement. DiagnosticDOM reproductible, sans essai VoiceOver/NVDA. `proposed-features-pressed.patch` ajoute seulement aria-pressed={activeTab === tab.id} au bouton existant dans app/components/marketing/EcodeProductMarketingPages.tsx. Aucune refonte en tablist, aucun changement de filtrage ou suppression. À valider : exactement un pressed=true à l’initialisation, après Space sur chaquecatégorie, puis aprèsresize ; mêmes nombres de cartes et conservation du focus.

Tests existants pertinents pour la suite : marketing-exact-support-policy.spec.tsx (mockadapté) et EcodeProductMarketingPages.spec.ts ; vérifier s’ils nécessitent une assertion comportementale ciblée supplémentaire. Aucun nouveau test/build de source lancé ici.

## Restant explicite

Aucun audit global terminé. `/ai-agent`, les autres pages marketing, documents légaux individuels horsPrivacy/Terms, docs, fragments Features et autres fragments Support-policy ne sont pas validés par ce complément. Pas de contraste calculé ni zoom200% dans ce lot (les précédents4zoom concernaientPrivacy/Terms seulement). Pas de clavier virtuel/safeareas physiques, lecteurécran réel, Firefox/Safari, authentification/backend réel, achats ou production. Preuves uniquement /tmp ; aucune modification source/index/commit/push.


## État après adoption et build9799

Les propositions précédentes décrivent le diagnostic9599. Le propriétaire a adopté les deltas Support/Features et le mock de test. [Validation après adoption](after9799/README.md) :14tests existants, lint3fichiers,16cas SupportCTA et4groupes de filtres Features réussis. Navigateur fermé ; source gelée préservée. Résultats locaux uniquement.
