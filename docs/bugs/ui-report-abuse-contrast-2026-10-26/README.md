# Contraste ciblé — diagnostic local, aucune modification produit

Build public-admin c282, provenance et SHA256 du bundle dans server-origin.json. Serveur14199/API6899 synthétique.24contextes : Reset, ReportAbuse et Hero MarketingDeployments ×FR/EN ×clair/sombre ×320/1440. Chromium local uniquement ; aucun POST, backend réel ou tiers atteint.0erreurJS,48GETGoogleFonts bloqués. Aucun commit/index/build supplémentaire.

## Défaut confirmé

ReportAbuse en thème clair, deux liens `/terms` et `/acceptable-use` (texte FR Conditions d’utilisation/Règles de la communauté ; EN Terms of Service/Community Guidelines). Couleur calculée rgb(245,101,5), fond opaque résolu rgb(252,252,252), ratio sRGB3,034:1. Taille14px à320 et12px à1440, graisse normale : sous le seuil indicatif4,5:1. Répété dans4contextes (FR/EN×320/1440), soit8mesures de deux liens. Source ReportAbuse.tsx371/375 utilise text-primary. Aucun delta appliqué ni proposé avant remontée au parent.

## Méthode et limites

receipt.json final et audit.cjs enregistrent couleurs CSS calculées, conversion canvas en sRGB opaque, luminances relatives, ratio et taille/graisse. Seuil3 pour texte≥24px ou≥18,667px gras700 ; sinon4,5. Les mesures concernent les éléments textuels sélectionnés, pas chaque pixel ni toutes les surfaces. Les textes des labels et actions sont inclus lorsqu’un fond solide opaque est résolu ; les placeholders et les champs vides ne sont pas évalués. Focus/hover/disabled, erreurs d’action et états de soumission ne sont pas validés.

Les erreurs Reset/ReportAbuse exigent une action POST : non exercées, conformément à l’interdiction de POST. Aucun faux état d’erreur n’a été injecté dans le produit ou le DOM. Pas de certification WCAG globale, pas de lecteur d’écran, Safari, appareil physique ou polices externes.

Exclusions explicites : transparence de fond ou de texte, gradients de fond ou couches sœurs absolues en dégradé, opacity/filter/blend, texte avec fill/clip et éléments désactivés. Aucun succès attribué à une exclusion. Les effets visuels complexes autres que ces détections restent une limite du diagnostic.

summary.json compte des mesures répétées, pas des contrôles uniques : Reset24évaluées/0sousseuil et80nonévaluées ; ReportAbuse352/8 et0nonévaluée ; Hero72/0 et24nonévaluées. Zéro échec calculé ne signifie donc pas contraste global conforme.

initial-unfiltered-receipt.json est conservé pour traçabilité et exclu des conclusions : il ignorait les couches sœurs en dégradé du Hero Reset, provoquant un faux ratio1,05 sur le fond body. La source AuthScreen montre ces couches ; le harness final les exclut et rejoue les24contextes. Les captures initiales Reset ne constituent pas une preuve de défaut.

cleanup.json vérifie les PID propres209314/209313, startTicks/cmdline, état final et ports séparément. Navigateurs fermés. Aucun processus d’un autre agent touché.

## Correctif local après diagnostic

Worktree isolé report-next, base ad80c14a. `open-pr-files.json` et `pr-check.json` attestent le contrôle de 32 PR ouvertes, avec pagination des listes longues : aucun fichier ReportAbuse.tsx concurrent. Les deux liens utilisent désormais le token texte existant `--ecode-accent-text`, sans modification de contenu, href, token global ou composant partagé.

`counterproof/receipt.json` : huit contextes FR/EN × clair/sombre × 320/1440 ; deux liens par contexte. Injection DOM locale de couleur pour contrepreuve, aucune source compilée modifiée pendant la mesure. Clair rgb(169,65,0), ratio 5,94:1 ; sombre rgb(255,138,61), ratio 7,77:1. Les deux liens dépassent le seuil indicatif 4,5 dans tous ces cas. Ce résultat ne remplace pas la recette du futur build commun.

`tests.log` : cinq tests existants ReportAbuse passent. `lint.log` et `format.log` : contrôles ciblés réussis. Aucun build isolé, index commun ou push. Les logs archivés ont leurs fins de lignes normalisées et espaces terminaux retirés. `counterproof/cleanup.json` confirme l’arrêt des seuls PID 211007/211006 avec vérification de provenance, état final et ports ; navigateurs fermés.
