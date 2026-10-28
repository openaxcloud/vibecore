# Bande Settings — build final

Six recettes Chromium locales compilées, API synthétiques, aucune soumission de formulaire. Pas d’override CSS dans ces reçus. 320/390 : bande58px flex/sticky et7boutons44px ;768/820 : bande88,25px, descriptions tablette conservées ;1280 : panneau587,66px, sidebar grid/static ;1920 : panneau1100,67px, sidebar280px sticky. Zéro erreur JavaScript.

Les champs before égaux à0 correspondent à une mesure avant hydratation, pas à une preuve avant correctif. La preuve du défaut original est le test CI strict de #838 (346px, trois essais) et la contre-preuve DOM de session décrite dans la fiche bug. Les mesures after sont celles du build corrigé hydraté.

Le seuil E2E existant60px à390 reste inchangé. Aucune preuve de compte, quota ou facturation backend réelle.
