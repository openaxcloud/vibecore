---
id: BUG-IDE-PANEL-WIDTH-20261026
---

# IDE : largeur réelle des panneaux et aides superposées

Signalement utilisateur du 26 octobre 2026 (captures web décrites par le parent).

## 📤 Dispatché

Oui — lot Agent séparé de #807 ; Settings préparé hors fichier réservé.

## 💻 Codé

Non sur main — corrections Agent validées localement, PR en préparation.

## ✅ Testé live

Non — composants locaux synthétiques, aucune recette authentifiée client.

## Défauts et périmètre

- Le menu Outils du composeur est tronqué par le panneau Agent sur grand écran quand Library est ouverte. Reproduction locale sur le JSX produit : écran2048/1536/1280, panneau320px ; certaines actions ne reçoivent plus les clics.
- Les chemins d'actions longs sont tronqués dans un panneau320–400px malgré le grand viewport. Le correctif local permet leur repli sans modifier les handlers, le statut ou les cibles tactiles.
- L'enrichissement des contrôles IDE peut activer GlobalTooltip sur un bouton déjà géré par Radix : deux aides personnalisées simultanées reproduites. Le correctif confie ce rendu à Radix. Après intégration de #808, l’enrichissement BaseChat respecte aussi les marqueurs Radix/masqué ; les titres servant seuls de nom accessible restent conservés.
- Settings Usage et Memory ont été intégrés après fusion de #808 : classes conditionnelles locales et défilement clavier du tableau, sans changement des autres onglets ou des handlers. Recettes JSX et build complet sur données synthétiques, écritures bloquées.
- Le grand toast desktop est reproduit sur les sources livrées de #807 : empilement opaque de 298,6 px. Le correctif local étend le mode compact à l’IDE desktop, ancre les messages dans le panneau Agent visible (380 px maximum) et conserve un emplacement de repli lorsque le panneau disparaît. Queue, erreurs et actions restent présentes. La réparation du défilement arrondit dans la bonne direction pour garder le bouton focalisé entièrement visible après resize, sans tolérance géométrique ajoutée.

## Limites de preuve

Les cinq références Library sont reconnues mais tous les téléchargements ont échoué. Aucune capture utilisateur n'a été inspectée par cette session ; les captures locales sont des fixtures synthétiques explicitement distinctes.

Aucun changement de données client, mémoire, quota, facturation, publication, secrets ou ressources. Publish et Domains exclus. Ces preuves ne certifient pas l'IDE entier ni Safari matériel.

## Correctif de navigation intégré

Escape du menu Outils était intercepté par useKeybindings en capture, défaut préexistant confirmé sur #807. Après accord de périmètre, exception ciblée et test durable intégrés ; recette du build complet verte sur trois formats, dialogue enfant et retour du focus inclus. La PR #811 reste brouillon/non fusionnée en attente de sa CI et de la fenêtre de livraison.
