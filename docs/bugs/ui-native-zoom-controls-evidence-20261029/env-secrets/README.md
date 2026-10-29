# Env/Secrets — zoom natif Chromium 200 %

Recette locale sur build parent ui843-zoom, serveur21999, APIs/runtime synthétiques interceptés. Aucun secret réel, révélation, copie, soumission ou modification produit. Un seul contexte persistant actif, profil test unique par cas, réglage chrome://settings/appearance #zoomLevel=2. Contextes fermés puis seuls profils test créés ici supprimés ; receipts/captures conservés.

## Résultats
5/6 cas finaux réussis, Env3 + Secrets2 ; Secrets390 échoue sur débordement réel (clientWidth163, scrollWidth249), filtre et remplacement réussis avant cette assertion. Aucun nouvel essai., physique390×844/820×1180/1280×900 donnant CSS195×422/410×590/640×450, DPR2 et CSSzoom1 contrôlés. Redimensionnement2560×1800 physique donnant1280×900CSS : remplacement réel de coque, ancien input détaché, filtre conservé, retour au format initial conservé. Clé et valeur Env synthétiques volontairement non conservées. Assertions strictes de focus/panneau et dimensions non assouplies ; aucun counterproof.

Preuves : native-env-filter-desktop-height/receipt.json et native-secrets-filter-desktop-height/receipt.json ; script probe.cjs.

## Précondition initiale incorrecte, conservée
Première série Env native-env-filter : 3 échecs sur absence de coque desktop après redimensionnement2560×900physique (1280×450CSS, disposition compacte). L'assertion du filtre n'était pas atteinte ; aucune perte démontrée. Correction du harnais sur hauteur1800physique, sans toucher produit, timeout ou assertion ; nouvelle série séparée. Les trois captures d'échec restent archivées.

## Limites
Chromium local, zoom natif réglage navigateur, fixtures isolées : pas backend réel/production, Safari physique ni appareil mobile réel. Ce complément valide filtre/remount et géométrie du panneau, pas toute action de gestion des secrets ni toute accessibilité. Aucun build ou redémarrage réalisé par cet agent.
