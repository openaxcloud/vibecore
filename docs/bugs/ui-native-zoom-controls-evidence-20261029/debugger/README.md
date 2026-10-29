# Debugger — Chromium zoom natif200%

Build partagé existant21999; aucune source/build/serveur modifié. Commande `PANEL=debugger MODE=long LABEL=native node /workspace/ui843-native-debugger/native-debugger.cjs`. Profil Chromium de test unique; `chrome://settings/appearance` zoomLevel=2. Pas de CSSzoom/injection.

3/3 premiers essais réussis:390x844physique→195x422CSS;820x1180→410x590CSS;1280x900→640x450CSS. DPR2 et computed CSSzoom1 explicitement vérifiés. Body client/scroll195/195,410/410,640/640. Textes longs PanelRows intégraux et sans débordement; Remove form/button72.117px, containment/scroll stricts, trial-only click et focus réussis; focus Refresh runtime réussi. Aucun vrai clic Remove/Start/Step, aucune mutation ou exécution runtime. API/runtime transport synthétiques isolés, WS fermés. Navigateurs fermés en finally.

Limites: Chromium local anglais, pas Safari/WebKit/appareil physique; pas recette production/moteur. Noms session/commande conservent truncate existant. Ce contrôle ne certifie pas tous les contrôles/panneaux de l’IDE. Receipt: native/receipt.json. Aucune reprise.
