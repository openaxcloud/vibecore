# Studio / Security — complément zoom limité

Serveur local21999 build assemblé ui843-zoom, Chromium headless, API/runtime synthétiques uniquement. Aucun Save/Scan/IA, changement produit, redémarrage ou publication. Navigateurs tous fermés via finally.

## Méthode
Coordination tooltip_diagnosis : Ctrl++ quatre fois ne change pas innerWidth/DPR/visualViewport dans ce navigateur headless. Cette recette utilise explicitement document.documentElement.style.zoom='2'. Reçus contiennent métriques avant/après. CSS zoom n'est PAS le zoom natif : innerWidth et breakpoints JavaScript restent inchangés, et les dimensions provenant de JS peuvent être doublées. Aucun résultat Safari/WebKit (exécutable absent), appareil physique ou zoom natif n'est revendiqué.

## Résultats
Ne pas lire les booléens pass comme certification visuelle complète : l'ancienne assertion porte sur scrollWidth/clientWidth interne ; la géométrie physique montre aussi les limites ci-dessous.

- studio-long/receipt.json : textes intégraux vérifiés aux3formats.390/820 sans débordement interne mais largeur visuelle716/1542 dépasse viewport390/820.1280 échoue strictement clientWidth29,scrollWidth48, largeur physique58, document2560.
- security-long/receipt.json : titre/détails intégraux et navigation clavier vérifiés.390/820 même dépassement physique716/1542.1280 échoue clientWidth29,scrollWidth74.
- security-draft/receipt.json : les3parcours390→1280,820→1280,1280→390 prouvent ancien nœud détaché et profilsca conservé (assertion exécutée avant géométrie). Deux arrivées1280 échouent ensuite géométrie29/38; arrivée390 satisfait géométrie interne mais conserve limite visuelle CSSzoom.

Aucune assertion affaiblie, aucune reprise des échecs. Captures failure.png conservées avant toute modification ; after.jpg pour cas passant assertions internes. Aucun changement produit proposé sur cette seule preuve : cause native réelle versus artefact CSSzoom non établie. Le zoom natif200% reste non validé ; besoin navigateur permettant zoom natif mesurable pour conclure. Script probe.cjs reproductible avec PANEL=studio|security, MODE=long|empty, DRAFT=1 pour profil.
