---
id: BUG-UX-PUBLICATION-HEADER-OVERFLOW-001
---

# Publication : libellé de journaux hors du bouton sur mobile FR

État : reproduit localement ; correctif CSS vérifié sur build local et six formats/langues ; non intégré à main.

Sur le build combiné fc8a687e + #750 + #753, mobile 390×844 FR : bouton supérieur « Afficher les journaux » de x250,734 à349 ; contenu jusqu’à377,156, scrollWidth126 contre clientWidth98. Le groupe d’actions est comprimé dans un en-tête flex sans retour à la ligne. Le bouton inférieur « Voir les journaux » est distinct et fonctionne.

Correctif limité à `app/styles/index.scss` : retour à la ligne de l’en-tête de carte publication, groupe d’actions non compressible. Aucun changement BaseChat, données ou budget de test.

Preuves et scénario : [recette](ux-publication-actions-2026-10-21/README.md). L’absence intermittente de bouton pendant « Loading publish… » est un défaut distinct : aucune réponse BFF deployments reçue à l’échec desktop EN de la matrice 5/6. Ne pas attribuer ce défaut de chargement au débordement CSS.
