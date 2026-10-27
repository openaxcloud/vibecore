# Complément toast — zoom natif 200 %, lecture seule

HEAD inspectée : 3d8059a3ad1fe8b540068ada09b5ed417ee0d169 (#807). Aucun fichier du dépôt modifié. Vrai AppToastContainer extrait exactement du fichier root.tsx, hook réel, React-Toastify réel ; assets CSS du build final (root Uno, Toastify, global index) avec empreintes dans build-assets.json. Trois contenus synthétiques, marqueur IDE synthétique et fond de harness : ceci ne représente pas une génération complète dans l’IDE.

20 étapes réussies : 9 largeurs CSS distinctes (320,360,390,768,820,1024,1280,1440,1920), puis retour390, dans chacun des deux thèmes. Chromium settingsPrivate.setDefaultZoom(2) et CDP Browser.setWindowBounds ; aucun deviceScaleFactor ni pinch zoom. Baseline DPR1, puis DPR2 et visualViewport.scale1 vérifiés. Les largeurs outer réellement lues sont consignées séparément des demandes (640→320 CSS notamment).

Bounds horizontales contenues ; queue de trois IDs conservée sur toutes les étapes ; mode compact <=1023 et retour desktop vérifiés ; fermeture compacte 44×44 et hit-test positif après navigation clavier ; clic final retire exactement une notification dans chaque thème. Zéro pageerror. Captures CDP utiles disponibles : light-320-0-200.png, dark-390-19-200.png notamment. Inspection visuelle ciblée 320 clair : texte replié et fermeture/focus visibles, liste bornée et contenu riche défilable.

Limites : viewport vertical CSS856, pas un téléphone physique ni Safari ; contenus FR synthétiques, pas matrice EN. Deux tentatives de chargement Google Fonts bloquées conformément à la règle sans tiers, donc polices de repli possibles. Le comportement desktop empilé est préservé et n’est pas certifié lisible pour chaque carte masquée. La limitation connue de focus déjà actif hors fenêtre après resize reste inchangée ; Tab/Shift+Tab est utilisé pour atteindre de nouveau la commande. Aucun test d’envoi/backend, aucun POST. Pas de certification WCAG.

Navigateurs fermés dans finally. Serveur PID vérifié par commande/startTicks puis arrêté ; cleanup.json confirme disparition. Aucun changement de PR, index ou source.
