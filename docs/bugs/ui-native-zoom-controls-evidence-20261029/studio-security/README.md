# Studio / Security — zoom Chromium NATIF 200%

9/9 cas réussis sur build local assemblé ui843-zoom à21999, données/API/runtime synthétiques. Aucun Save/Scan/IA, produit modifié, build/restart ou publication. Un seul navigateur à la fois, tous fermés.

Méthode : launchPersistentContext avec profil de test distinct par groupe, chrome://settings/appearance #zoomLevel selectOption('2'), puis pages neuves avec viewport physique explicite. Aucun CSS injecté. Chaque cas exige innerWidth=largeurphysique/2, DPR=2 et CSSzoom=1.

- Studio longs textes :390/820/1280physiques donnent195/410/640CSS,3/3. Claim et summary exacts, clavierEnter ouvre consensus, absence overflow interne et horizontal document.
- Security longs textes : mêmes formats3/3. Titre/détails exacts, navigation clavier des5onglets, absence overflow interne/document.
- Security brouillon :3/3. Chaque format initial redimensionné à2560physiques=1280CSS pour vraie coqueDesktop. Ancien select détaché explicitement, profilsca conservé après réouverture Settings, absence overflow interne/document. Pas de sauvegarde ni scan.

Reçus studio-long/receipt.json,security-long/receipt.json,security-draft/receipt.json ; script ../studio-security-probe.cjs. Aucun échec ni retry dans cette recette native.

Les échecs CSSzoom précédents restent conservés dans /workspace/ui843-zoom-studio-security ; ils caractérisent l'artefact de cette méthode et ne prouvent pas un défaut zoom natif du produit. Cette nouvelle preuve ne certifie ni Safari/WebKit (absent), appareil physique, backend ni production.
