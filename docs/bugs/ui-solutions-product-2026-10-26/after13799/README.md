# Première recette compilée : échec conservé

Source5285a7e01c734954958cdbf9e7ced71918840494, serveur13799/API6899 synthétique. Le harness prévoyait44observations et8groupes mais s’arrête après3observations FRclair320/360/390 et1groupe clavier. À844×390 le CTA documentation mesure22px : défaut réel, pas recette complète. Aucun verdict vert sur les44cas prévus.

Cause : EcodeExactUi size lg ajoute md:min-h-0 ; le h-auto local rend ce minimum nul visible. diagnostic.json contient HTML/computedstyles, diagnostic-844.png la capture. La liste des règles CSSOM est vide et ne sert pas de preuve ; classe source et computedminHeight0 concordent.

Contrepreuve minheight-counterproof.json :8cas FR/EN×844/820/1024/1440, injection DOM min-height44px!important, hauteur22→44 et textes/liens conservés. Les deux premiers essais mesurent trop tôt la transition-all et restent22px ; logs conservés, exclus du verdict stabilisé. Avec350ms de stabilisation tousles8cas passent. Cela démontre la priorité CSS, pas encore la génération UnoCSS du correctif source.

Après accord parent, une seule classe locale min-h-[44px] devient !min-h-[44px]. Aucun composant partagé modifié. Lint/formatage ciblés dans les logs ; aucun nouveau build. Prochaine recette compilée44observations+8groupes encore requise. Navigateurs fermés, cleanup.json revalide les deux processus propres et confirme leur terminaison séparément des ports refusés.
