# Double infobulle — diagnostic et correctif local

Chromium local sur build47b1e2e922, données synthétiques isolées, aucun secret réel lu/révélé/copië. Les textes testés sont des clés synthétiques longues. Aucun POST métier ou appel IA.

## Preuve rouge

`before/receipt.json` et `before/1280-tooltip.png` : après focus clavier sur le bouton de menu Secrets, un vrai noeud role=tooltip ET un pseudo-élément CSS ::after affichent le même texte. Le panneau mesure588px mais scrollWidth2298px. Capture originale également inspectée : deux bulles distinctes, une au-dessus coupée et une dessous.

Le CSS IDE rend :focus-visible::after immédiatement, tandis que GlobalTooltip rend sa bulle déléguée. La règle role=tooltip replie déjà les mots ; le pseudo-élément CSS ne le fait pas. Le défaut ne provient pas d'une valeur secrète.

## Correction source appliquée, non publiée

- GlobalTooltip.tsx : marqueur de propriété sur documentElement durant la vie du renderer, compté par WeakMap<Document>. Le dernier démontage restaure l'attribut préexistant ou le retire. StrictMode et montages simultanés ne libèrent pas prématurément le secours CSS.
- index.scss : seulement les deux sélecteurs CSS de secours before/after sont conditionnés à l'absence du renderer. La règle d'ancrage position:relative garde sa spécificité nulle. Le secours replie aussi les mots longs avec overflow-wrap:anywhere.
- Aucun data-vc-tooltip-hidden global, suppression de libellé, changement de positionnement ou de comportement Radix.

Le marqueur reste actif quand Escape/scroll ferme la bulle : enlever seulement un marqueur d'ancre à la fermeture aurait fait réapparaître le pseudo-élément sous le focus restant.

## Tests et limites

Cinq nouveaux tests échouaient avant le correctif, six tests existants passaient. Après :17/17 tests GlobalTooltip/ancrage/tactile réussis, zéro ignoré ; lint ciblé réussi. Tests : cycle montage/démontage, dernier propriétaire, valeur antérieure + StrictMode, fermeture Escape/scroll sans rendre le secours éligible, Radix et native-title inchangés.

Contrepreuve DOM isolée : `counterproof/receipt.json`,3/3 verts390/820/1280, une bulle role=tooltip avec texte intégral et pseudo:none ; scrollWidth358/771/588 égale largeurclient. Cela n'est PAS encore une validation du build corrigé.

Recette finale après build root, SANS injection de contrepreuve :
PANEL=secrets MODE=long EXPECT_RENDERER=1 LABEL=compiled node /workspace/ui841-tooltip/probe.cjs

Elle exige en plus le marqueur réel, aucune résurgence après Escape/scroll et focus conservé. Aucun Safari physique, clavier virtuel ou certification globale d'accessibilité. Tous mes navigateurs sont fermés ; serveur parent inchangé.

## Recette compilée et diagnostic Escape

Le premier build assemblé corrige le double rendu/overflow : trois formats ont une seule bulle, texte intégral, pseudo:none et largeur normale. Mais `compiled/receipt.json` reste ROUGE3/3 sur fermeture de la bulle. Ne pas le compter comme validation complète.

Une reproduction instrumentée unique1280 (`compiled-instrumented/receipt.json`) établit le stade `before-Escape` : le vrai événement est vu en capture sur window, jamais en capture sur document. `useKeybindings` écoute window/capture et stopPropagation pour le raccourci Escape d'un bouton ; le listener GlobalTooltip sur document ne reçoit donc pas cet événement. Aucun code de useKeybindings n'a été modifié.

Correctif additionnel local : GlobalTooltip écoute la fermeture clavier sur window/capture et nettoie le même listener. Il ne fait ni preventDefault ni stopPropagation. Deux tests intégrant le VRAI useKeybindings, avec les deux ordres d'enregistrement, échouaient avant ce déplacement (12autres verts). Après :26/26tests GlobalTooltip/useKeybindings.dialog/ancrage/tactile réussis, aucun ignoré ; lint ciblé réussi. Un troisième test intégré vérifie fermeture du menu propriétaire et Ctrl+S global.

Le nouveau build root et la même recette finale3formats restent à exécuter. Aucun nouveau navigateur lancé après ce changement source ; tous les navigateurs diagnostiques sont fermés.

## Validation compilée finale

Sur le build final root servi sur21999, commande exacte sans COUNTERPROOF :
`PANEL=secrets MODE=long EXPECT_RENDERER=1 LABEL=compiled-final node /workspace/ui841-tooltip/probe.cjs`

`compiled-final/receipt.json` : **3/3réussites**390/820/1280, zéro erreur JavaScript. Une seule bulle role=tooltip, texte intégral égal à la clé synthétique et son libellé, pseudo:none. Largeurclient/scroll du panneau respectivement358/358,771/771,588/588. Marqueur de renderer réel vérifié. Escape ferme la bulle en conservant le focus ; aucune résurgence du pseudo. Le focus suivant rouvre l'aide, puis scroll la ferme sans secours CSS parasite. Trois captures finales `compiled-final/*-tooltip.png` conservent la géométrie avant fermeture.

Aucune relance automatique, aucune injection CSS de contrepreuve, aucun secret réel/révélation/copie/mutation. Les trois échecs du premier build restent conservés. Tous les navigateurs ont été fermés normalement ; serveur parent inchangé. Cette validation reste Chromium local synthétique, pas Safari physique ni production.
