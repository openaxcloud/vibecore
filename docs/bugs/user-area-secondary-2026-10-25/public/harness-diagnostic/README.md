# Sélecteur de harness corrigé

Le premier sélecteur `button[aria-pressed]` était trop générique : il sélectionnait le choix de langue avant les contrôles de périodicité. Une tentative PATCH `/api/user/preferences` a été interceptée et annulée dans le navigateur, avant tout accès serveur/backend. Aucun compte ni préférence réelle modifiés. Ces reçus bruts restent ici et ne démontrent pas le changement de périodicité ; ce verdict initial a été retiré.

Le harness corrigé cible les deux `main button[aria-pressed]`, vérifie leur nombre puis le nouvel état `aria-pressed=true` du deuxième bouton, correspondant au groupe de périodicité du composant Tarifs. Les passages avant7499 et après7799 ont été rejoués : FR/EN, toggle puis Accueil/Retour, mutations=[] et aucune erreur JavaScript. Les reçus conclusifs sont ailleurs ; ne pas compter les passages diagnostiques comme validations supplémentaires.
