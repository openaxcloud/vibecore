# Aide longue — recette indépendante compilée

## Résultat stable : 4/4, zéro reprise de cette version de recette
`compiled-stable-fixture/receipt.json` / `stable-fixture.cjs` :
- EN390×320 physique @100% (390×320CSS)
- EN390×320 physique @200% (195×160CSS)
- FR820×400 physique @200% (410×200CSS)
- EN1280×400 physique @200% (640×200CSS)

Zoom natif via chrome://settings/appearance, DPR et CSSzoom=1 vérifiés. Texte synthétique1725caractères EN/2115FR, FIN-MARKER-844 en fin, égalité intégrale du texte contrôlée. Véritable renderer GlobalTooltip du build ui844-tall-help-compiled ; ancre bouton DOM synthétique stable ajoutée horsReact, sans événement factice, sans modification du composant ni injection de correction.

Contrôles passés : action compacte bornée au viewport ; F1 natif depuis ancre ; dialogue nonmodal nommé et région nommée focalisée ; PageDown défile ; End atteint le bas à≤1px ; Home puis roulette défile ; Escape ferme et refocalise ; déplacement souris20pas traversant espace jusqu'au bouton puis vrai clic ; ShiftTab versFermer puisTab versrégion puisTabsortsanspiège ; réouvertureF1 ; resizephysique+40×+60 pendantlecture, géométrie stricte, EndpuisEscape etfocus. Zéro erreurJS. Aucun seuil diminué. Navigateurs fermés, profils TEST propres supprimés.

## Échecs initiaux conservés
`compiled-independent/receipt.json`, quatre captures : quatre échecs avant fiabilisation de la fixture. EN390@100 et1280@200 atteignaient la sortieTab puis le harnais attendait l'évaluation d'un locator dialogue déjà démonté ; remplacé par interrogationDOM immédiate, même assertion focus extérieur. FR montre l'infobulle originale«Actions sur les secrets» : l'attribut ajouté sur une ancre appartenant àReact était réécrit. EN390@200 échouait sur absence d'action après fermeture, cause exacte de ce cas initial non isolée séparément. La fixture stable évite la mutation d'un attribut géré parReact ; ce changement ne constitue pas une correction produit. Aucun de ces échecs initiaux n'est effacé ni compté comme succès.

## Portée et limites
Chromium local et fixtures réseau isolées seulement, aucune donnée secrète, création, soumission, scan ou backend réel. L'ancre stable est synthétique ; les interactions/dialogue/texte/scroll/focus sont ceux du vrai composant compilé. Pas de revendication de Tab vers le bouton transitoire : son accès clavier est F1 depuis l'ancre. Pas de Safari ou appareil physique ni recette production. Aucune source, build, redémarrage ou publication modifiés par cet agent.

## Complément intégration réelle du composant Secrets
`real-secret-anchor.cjs`, `compiled-real-secret-anchor/receipt.json` : vraie clé longue issue de fixture API, bouton produit `.bolt-secrets-chip--key`, attribut tooltip enrichi naturellement, aucune écriture attribut postmontage et aucune copie/révélation. **1/4 parcours complets vert** (390×320@100%) ; **3/4 incomplets** à200%, tous à initial focus avantF1. Le contrôle initial d'occlusion retourne faux : FR820 est couvert par `.bolt-mobile-replit-icon-tab`,1280 par `.bolt-mobile-replit-panel-scroll`,390 horszone au point central. À390/1280 l'action est brièvement visible puis absente avant lecture géométrique ; FR jamaisvisible dans la fenêtre5s. Les captures et erreurs originales sont conservées ; cause exacte de disparition non isolée, aucune correction ni reprise ni seuil élargi. Ces3cas NE sont PAS validés par les4cas de renderer synthétique.
