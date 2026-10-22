# Preuves baseline desktop — sélection publique expurgée

Produit main `18745bd04f77e4d9fc6353d61bd4d17a3822f94e`, build local `edb558bc326be7075ce042beeea25685a0e8864f` : 2 306 fichiers compilés attestés par le reçu de comparaison, delta documentaire seulement. Frontend et API locaux avec données synthétiques. Ces preuves ne concernent pas les builds correctifs ultérieurs, notamment c382137ad, et ne certifient pas la production.

## Rouges produit

- Palette globale 1440 : recherche saisie, vraie requête ide-state retenue puis continuée sans réponse simulée ; après remplacement du témoin DOM, champ absent durant les 5 s de l’assertion. Deux captures avant/fin inspectées. Le même rapport contient deux menus Agent verts et un timeout de préparation1024, à distinguer ci-dessous.
- Toolbar Preview 1440 : limite droite barre1145,265625 px ; Logs1280,015625 et options fenêtre1314,015625. Débordement initial confirmé. Le clic natif peut faire défiler un ancêtre puis réussir : cela ne prouve pas une action toujours inaccessible. Le contrôle d’actions corrigé est vert.
- Menu Preview : deux rouges directs, Escape et clic extérieur laissent le menu visible pendant5s. La capture publiée est avant Escape, pas une preuve visuelle après Escape ; les verdicts du reçu établissent l’échec.
- Problems : demande URL → zéro onglet Problems, README rendu. L’autre cas du rapport, barre de statut → tiroir inférieur, est vert. Cause diagnostiquée : omission de problems du catalogue du modèle alors que le registre workspace l’accepte. Aucun résultat navigateur du correctif inclus ici.

## Faux rouges et limites conservés

- Palette1024 : préparation utilisant le rail large indisponible sur la surface compacte, timeout90s puis cleanup sur page fermée ; aucune preuve de disparition à1024 dans cet essai.
- Premier essai Preview après clic Logs : mauvais sélecteur console-tool au lieu de preview-logs-panel. Le clic avait réussi ; ce rouge est une erreur de recette. Le contrôle corrigé publié passe.
- Première attente de barre Problems : elle exigeait à tort une URL/onglet, alors que cette entrée ouvre un tiroir. Le scénario rectifié passe et reste distinct du vrai rouge URL.
- Audit31portes : files est bibliothèque latérale, domains ouvre la vue Domains de Deploy ; attendre leurs propres onglets créait des faux rouges de ciblage. Les erreurs503Studio/Problems et429Debugger/Deploy limitent les données et actions, sans expliquer automatiquement les défauts UI.
- Expériences CSS injectées : diagnostics seulement, pas validation du produit compilé. Première préparation Sass indisponible corrigée en utilisant sass-embedded déjà présent, sans dépendance ajoutée.

Les reçus ne contiennent que noms de tests, projets Playwright, verdicts, durées, compteurs et empreintes des rapports originaux. Aucun rapport brut API/Playwright, session, storageState, cookie, token, en-tête, traceZIP ou réponse métier copié. Les cinq images ont été inspectées : interface et libellés de projets synthétiques uniquement, sans donnée personnelle ou secret identifié. Les noms synthétiques visibles ne sont pas des comptes réels. Aucune mutation externe effectuée ; publication laissée au parent.
