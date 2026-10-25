# Audit public suivant — lecture seule, build8999

Groupe cohérent retenu : `/contact` et `/contact-sales`, routes réelles `app/routes/contact.tsx` et `contact-sales.tsx`, composants `Contact.tsx` et `ContactSales.tsx`. Les formulaires envoient normalement vers `/api/contact/general` et `/api/contact/sales` ; aucune soumission valide ni appel de ces API n’a été effectué. AGENTS.md lu ; seule compétence locale disponible commit-helper, non applicable à cet audit sans commit.

## Matrice exacte

| Routes | Largeurs | Langues | Thèmes | Résultat |
| --- | --- | --- | --- | --- |
| Contact et Contact-sales | 320,390,768,1440 ×900 | FR/EN | clair/sombre | 32 observations, aucun élément de contenu dépassant horizontalement de plus de1px |
| Contact et Contact-sales | 320→1440→390 | FR/EN | clair/sombre | 8 parcours : soumission vide locale, focus nom, erreurs aria-invalid3/4, saisie synthétique, Tab du message au bouton avec box-shadow de focus, brouillon conservé |
| Contact et Contact-sales | 320×900 | FR/EN | défaut sombre | 4 parcours logo→Accueil→Back, route et formulaire retrouvés ; nom focalisé visible/non recouvert au centre après validation vide |
| Image Contact différée | 390×900 | FR | défaut sombre | chargée après défilement :1200×747, complete=true |

Aucun défaut produit reproductible confirmé dans ce périmètre. Pas de modification proposée. Les contrôles de géométrie parcourent les enfants du contenu, sans se limiter au scrollWidth global. Ils ne constituent pas une preuve de tous les débordements internes/visuels possibles. Captures pleine page320/1440 disponibles pour les huit combinaisons route/langue/thème ; inspection visuelle ciblée Contact FR clair320 et Contact-sales FR sombre320. Les captures `form-*` peuvent inclure l’en-tête fixe superposé lors du cadrage automatique : ne pas en déduire un focus masqué ; les captures `focus-*` et hit-tests vérifient séparément le focus réel.

## Preuves et diagnostics

`receipt.json` :32 cas et8 interactions, erreursJavaScript=[], mutations=[]. `navigation.json` :4 parcours supplémentaires, coordonnées/hit-test du focus et URL après Back. `image.json` et `contact-dashboard-loaded.png` prouvent que le rectangle vide de la capture initiale est une image lazy non encore chargée, pas un défaut confirmé.

Le premier harness s’est arrêté après4géométries car `form button[type=submit]` ciblait aussi la newsletter du footer : strict-mode a empêché le clic. Reçu partiel et diagnostic conservés. Sélecteur corrigé vers `form[data-testid]`. Un premier harness Back a réussi Contact FR/EN puis attendu un lien `/signup` absent de Contact-sales ; diagnostic conservé. Le parcours final utilise le logo réellement présent sur les deux routes. Ces erreurs de harness ne sont pas des défauts du produit. Tous les navigateurs ont été fermés.

## Limites et pages restantes

Aucune recette backend, transmission de message, ouverture mailto, récupération réseau, authentification ou production. Les API sont des fixtures locales ; toutes les mutations et requêtes tierces bloquées. Pas de contraste calculé pour ces deux pages ; pas de certification de contraste par simple capture. Pas de zoom200%, paysage, clavier virtuel réel ni safeareas physiques dans ce lot. Escape/menu commun déjà testé dans le lot précédent, non répété ici.

Pages encore non couvertes par ce complément : `/support-policy`, `/legal`, `/terms`, `/privacy`, autres pages marketing et `/docs`. `/support` est une surface authentifiée, exclue de ce groupe public. Les matrices Accueil/Tarifs/Login/Signup précédentes restent séparées. Aucun fichier produit, index, commit ou PR modifié ; preuves uniquement dans `/tmp/ui-audit-next-public`.
