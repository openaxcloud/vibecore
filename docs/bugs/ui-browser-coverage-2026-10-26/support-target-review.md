# Revue indépendante — cible du bouton Support

Avis favorable au delta local, sous réserve de la recette compilée après correction exécutée par son propriétaire. Aucune validation production revendiquée.

Preuve lue : `/tmp/ui-browser-zoom-next/control-diagnostic.json`. Le bouton réel « Envoyer le message », dans le formulaire principal du ticket synthétique, porte `data-vc-button="true"`, `data-size="default"` et `min-h-[44px]`. Sa hauteur mesurée est pourtant36px (largeur262px), avec `getComputedStyle().minHeight="36px"`, `innerWidth=320`, `outerWidth=640`, DPR2. Ce reçu confirme le défaut de cible44 attendu localement ; il ne suffit pas à déclarer une violation WCAG ni à certifier seul tous les mécanismes du zoom natif.

Cause source cohérente : `app/styles/index.scss:1642` impose36px par `body button[data-vc-button='true'][data-size='default']`, plus spécifique que la classe utilitaire. Le Button partagé possède aussi `h-9`. Le minimum local important prend priorité et borne cette hauteur à44px. La même convention existe déjà dans `app/routes/support.tsx:392`.

Diff réellement relu : seule la classe de `support_.$id.tsx:584` devient `!min-h-[44px]`. L’assertion du bouton rendu dans `support-ticket-detail.i18n.spec.tsx` exige désormais explicitement le préfixe important. Aucune modification du Button partagé, CSS global, largeur responsive, texte, destination, type submit, état disabled, aria-busy, garde de brouillon ou contrat d’action.

Le minimum explicite en pixels reste stable quand la taille racine change. Il ne supprime ni le repli du libellé ni les actions. Il ne garantit toutefois pas une hauteur intrinsèque illimitée pour des traductions arbitrairement longues : contrôler FR/EN et le libellé pendant envoi dans la recette ciblée. L’assertion de classe est une garde utile, pas une preuve de cascade CSS calculée ; la mesure compilée après correction reste nécessaire.

Cette revue n’a lancé aucun test redondant, navigateur ou appel API. Build/tests en cours au moment de la rédaction, résultats à rattacher par le propriétaire. Aucun fichier produit, index ou commit modifié par le relecteur.

## Complément compilé 11799 — mesure positive, captures insuffisantes

Le parent rapporte build, typecheck, lint ciblé, Prettier et28tests réussis. Le reçu `/tmp/ui-browser-zoom-next/after11799/receipt.json` effectivement lu mesure le bouton Support FRclair à44px, notamment pour innerWidth320/outerWidth640/DPR2, avec `lastControlReachable=true` et aucun débordement document recensé. C’est une preuve de géométrie compilée positive ; ce n’est pas une validation sur appareil physique iOS.

Deux captures examinées indépendamment : `_support_synthetic-ticket-fr-light-640-200.png` et `_quota-exceeded-fr-dark-390-200.png`. La première montre essentiellement le fond clair sans contenu ; la seconde un fond sombre et des fragments de navigation basse, sans le contenu Quota. Elles ne permettent donc pas de confirmer visuellement le bouton, le texte, le contraste apparent ou l’absence de découpe locale. Ce constat a été transmis au propriétaire des captures et au parent pour diagnostic et éventuelle recapture ciblée. Il ne démontre pas à lui seul un défaut produit : position de scroll et capture/composition du navigateur restent à distinguer. Aucun avis visuel favorable n’est déduit de ces deux images.

Précision de dimensions : le cas demandé390 a `innerWidth195` mais le reçu indique `outerWidth500` (minimum de fenêtre), et non390. Ne pas présenter le nom du cas ou son champ `physicalWidth` comme une mesure matérielle. Les dimensions navigateur mesurées font foi.

## Capture CDP ciblée — complément visuel favorable

Les captures de remplacement `after11799/capture-diagnostic-support-cdp.png` et `capture-diagnostic-quota-cdp.png`, ainsi que `capture-diagnostic.json`, ont été inspectées indépendamment. Elles montrent cette fois le contenu réel. Support FRclair présente le libellé, la zone de réponse, le compteur et le bouton entier, sans découpe apparente. Quota FRsombre présente la consigne repliée et les deux liens empilés, avec leurs textes entiers. La partie supérieure des pages est hors champ du fait du scroll ciblé : ce sont des inspections des actions, pas de la page complète. Aucun verdict de ratio WCAG ou de focus clavier n’est déduit des images.

Le diagnostic Support mesure innerWidth320, outerWidth640, DPR2 et un bouton262×44px, minHeight44px, entièrement dans le viewport (y326,625→370,625 pour hauteur406). Le diagnostic Quota mesure **innerWidth250, outerWidth500**, malgré requestedWindowWidth390 ; son lien final mesure185×44px et reste visible (y323→367). L’image Quota ne constitue donc **pas** une inspection visuelle à195px CSS. Les cas195px de la matrice séparée restent des mesures de ce harness, sans être confondus avec cette capture de remplacement.

Avis visuel favorable sur ces deux actions ciblées du build local11799. Les premières captures Playwright restent des preuves inexploitables visuellement, conservées comme telles ; le fallback CDP apporte le complément visible, sans effacer leur limite ni attribuer une cause produit à leur fond vide. Aucun nouvel appareil physique, recette production ou validation globale n’est revendiqué.
