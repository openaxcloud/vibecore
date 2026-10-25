# Contraste du body après défilement — build local 8999

16 cas : Accueil, Tarifs, Login et Signup, français, 320 et 1440 px, clair et sombre. **1 334 échantillons textuels mesurés, 982 exclus. Minimum 4,7975:1 ; aucun échantillon retenu sous 4,5:1 ni sous son seuil applicable.** Zéro erreur JavaScript et zéro mutation tentée. Navigateur fermé à la fin ; aucune source produit modifiée.

| Route | Cas | Mesurés | Exclus | Minimum |
| --- | --- | --- | --- | --- |
| `/` | 4 | 588 | 360 | 4.7975:1 |
| `/pricing` | 4 | 702 | 278 | 5.1784:1 |
| `/login` | 4 | 24 | 152 | 5.1784:1 |
| `/signup` | 4 | 20 | 192 | 5.1784:1 |

Les mesures sont des échantillons répétés par combinaison, pas des textes uniques. Le body entier est analysé : 40 mesures de header, 276 de footer et 1 018 de contenu. Les régions présentes mais non mesurables figurent dans les exclusions ; les pages auth n’utilisent pas le header/footer marketing.

## Montage des sections différées

Le script défile par pas de 675 px, attend les insertions et exige trois observations stables en bas de page. Il vérifie ensuite les neuf sections différées Accueil : stats, vidéo, projets, modèles, fonctionnalités, langues, workflow, témoignages et CTA. Le hero s’y ajoute. Elles restent montées après retour en haut. Le reçu conserve `initialDom`, `warmup`, `steps` et les identifiants pour chaque cas.

Sur Accueil, le nombre d’éléments passe de 562 à 958 en clair et de 554 à 950 en sombre. La hauteur passe de 9 347 à 15 398 px à 320, et de 6 404 à 8 377 px à 1440. Les quatre cas atteignent le bas et contiennent les neuf sections attendues. Le relevé initial limité de 612 mesures est conservé séparément dans `../contrast8799/` : ne pas additionner ces deux phases comme couverture unique.

## Méthode et minimum

La formule sRGB de luminance et le compositage des couleurs uniformes reprennent le helper `docs/bugs/user-area-2026-10-25/scripts/contrast.cjs`. Le seuil applicable vaut 4,5 pour le texte normal, 3 pour le grand texte (24 px ou 18,6667 px et graisse au moins 700). Le contrôle supplémentaire de tous les échantillons à 4,5 est également vert.

Le minimum concerne des paragraphes Accueil en sombre : classe `text-[var(--ecode-text-muted)]`, texte `rgb(148,156,166)` sur une section opaque `bg-[var(--ecode-surface-tertiary)]`, fond `rgb(43,48,53)` ; ratio 4,797492185149004. Exemple : « Des modèles prêts pour la production afin d’accélérer votre développement ». Le reçu précise classe, texte, taille, graisse, surface opaque, couleurs et ratio de chaque élément retenu.

## Exclusions prudentes

Les motifs suivants sont **non exclusifs** et ne s’additionnent pas pour reconstituer les 982 exclusions :

- 220 : `not rendered`.
- 84 : `gradient/image in ancestor chain`.
- 606 : `overlapping decorative layer / uncertain painted background`.
- 116 : `foreground alpha`.
- 8 : `disabled control`.
- 24 : `opacity in ancestor chain`.
- 36 : `visually clipped text`.
- 224 : `auth glow/translucent region without an opaque covering surface`.

Les surfaces auth à glow ou transparence sont exclues sans fond opaque réellement couvrant. Les gradients/images, couches décoratives absolues ou fixes au fond incertain, texte avec alpha, opacités, contrôles désactivés et texte masqué ne produisent aucun verdict de contraste. Les ombres/pseudo-éléments, valeurs et placeholders des inputs, états après saisie/erreur, icônes et contraste non textuel ne sont pas modélisés. Aucun menu n’est ouvert dans cette mesure. Les contrôles natifs n’ont pas été soumis.

Cette couverture porte sur les éléments montés et les fonds simples retenus ; elle ne certifie ni toute l’accessibilité, ni les fonds complexes, ni la production. Les captures visuelles des phases précédentes sont distinctes de ces ratios calculés. API synthétique locale 3699, sans authentification réelle ni opération client. Aucun échec retenu ne nécessite de contrepreuve corrective.

## Rejouer

Avec le build local et Chromium disponibles : `NODE_PATH=$PWD/node_modules UI_BASE_URL=http://127.0.0.1:8999 node chemin/contrast.cjs`. Le script exige une URL locale, bloque toute requête tierce et toute méthode autre que GET, et écrit dans `/tmp/ui-public-contrast-body/` (à créer avant exécution). `run.txt` et `receipt.json` sont les résultats bruts de cette phase.
