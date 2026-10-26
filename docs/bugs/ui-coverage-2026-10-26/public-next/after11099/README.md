# Docs SSR — build final11099

16contextes neufs : FR/EN ×clair/sombre ×320/1440 ×première/dernière section (agent-mentions,agent-i18n), chacun avec accueil→Retour. Cible présenteHTML initial et titre visible sous header, à froid et aprèsRetour :16/16. 2caszoom natif200% FR/ENclair premièresection : largeurCSS640,DPR2,visualViewport.scale1, aucun débordement document, cible visible.

Zéro erreurJavaScript/mutation dans reçus. Aucun backend réel/compte/production. GETorigine locale seulement ; tiers/nonGETbloqués. Captures viewport16cas, inspection visuelle ciblée FRclair320 mentions. Tous navigateurs fermés. Serveur du parent non arrêté.

Diagnostic harness conservé : receipt-immediate-back.json/immediate-back.log mesuraient certains rects à0 juste après goBack avant rendu. Reprise avec expect visible et poll position :16/16 validés. Ce diagnostic n'est pas un échec produit puis retry masqué ; aucun verdict Retour positif n'avait été donné avant attente explicite. Les16cas ne deviennent pas32cas distincts.

Les88géométries/4zooms de10899 ne sont pas répétés : ce passage vérifie seulement le deltaSSR Docs, combiné au CSSscroll de l'autre périmètre. Les parcoursfonctionnels réels des fonctionnalités illustrées ne sont pas testés.
