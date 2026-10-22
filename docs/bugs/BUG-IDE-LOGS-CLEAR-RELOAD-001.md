---
id: BUG-IDE-LOGS-CLEAR-RELOAD-001
---

# Journaux : Reload laisse la vue vide après Clear logs

## 📤 Dispatché

22 octobre 2026 : lot séparé de #768, limité à ProjectLogsPanel et sa recette. Base e4bda1fb, sans changement aux propositions d’agent, à la palette ou aux réglages utilisateur.

## 💻 Codé

Correctif local préparé ; non intégré à main. Le geste Reload remet l’état de masquage local à false avant d’appeler le chargement existant. Le polling ne réinitialise pas cet état. Aucun effacement serveur, changement de quota ou d’accès.

## ✅ Testé live

Rouge réel local sur le produit compilé 2a1c2bc3, à 1440×900 et 1024×768 : System logs affiche 13 lignes, Clear logs masque tout, Reload reçoit HTTP 200 avec 20 événements recentActivity mais la vue reste vide. Recharger complètement la page restitue les 13 lignes. Le message affiché invite pourtant à utiliser Reload. Données synthétiques, API/PostgreSQL locaux ; aucune preuve production.

Cause : `cleared` reste true dans ProjectLogsPanel ; la liste est calculée comme vide malgré les données reçues. Le bouton Reload appelait seulement le chargement. Les compteurs serveur ne prouvent pas la présence d’un runtime : runtimeLogs était vide avant le geste.

Nouvelle régression et recette compilée en préparation. Les preuves rouges et les limites seront conservées avec le SHA exact du correctif testé. Aucun panneau entièrement certifié.
