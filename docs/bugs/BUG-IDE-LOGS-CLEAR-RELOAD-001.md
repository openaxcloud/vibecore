---
id: BUG-IDE-LOGS-CLEAR-RELOAD-001
---

# Journaux : Reload laisse la vue vide après Clear logs

## 📤 Dispatché

22 octobre 2026 : lot séparé de #768, limité à ProjectLogsPanel et sa recette. Base e4bda1fb, sans changement aux propositions d’agent, à la palette ou aux réglages utilisateur.

## 💻 Codé

Correctif compilé `ddfdb38cfc9d671c74c127474e901b49505072f2` ; non intégré à main au moment de la recette. Le geste Reload remet l’état de masquage local à false avant d’appeler le chargement existant. Le polling ne réinitialise pas cet état. Aucun effacement serveur, changement de quota ou d’accès.

## ✅ Testé live

Rouge réel local sur le produit compilé 2a1c2bc3, à 1440×900 et 1024×768 : System logs affiche 13 lignes, Clear logs masque tout, Reload reçoit HTTP 200 avec 20 événements recentActivity mais la vue reste vide. Recharger complètement la page restitue les 13 lignes. Le message affiché invite pourtant à utiliser Reload. Données synthétiques, API/PostgreSQL locaux ; aucune preuve production.

Cause : `cleared` reste true dans ProjectLogsPanel ; la liste est calculée comme vide malgré les données reçues. Le bouton Reload appelait seulement le chargement. Les compteurs serveur ne prouvent pas la présence d’un runtime : runtimeLogs était vide avant le geste.

Recette de régression renforcée sur baseline `838684f007255fb0f91177f5e1598940ad084fca` : deux échecs directs (1440×900 et 1024×768), cinq lignes avant Clear puis zéro après Reload malgré HTTP 200 et trois événements dont l’import ZIP. Sur le build corrigé `ddfdb38cfc9d671c74c127474e901b49505072f2` : deux succès directs, zéro retry/omission, cinq lignes restaurées sans rechargement de page ; rechargement complet ensuite vérifié. Ces fixtures plus petites sont distinctes de la première observation à 13 lignes ci-dessus.

[Preuves rouges/vertes, captures et provenance](https://github.com/openaxcloud/vibecore/blob/45c503a41c8b6c47e95decd2ec60ff944d143435/docs/bugs/logs-reload-2026-10-22/README.md). API/PostgreSQL locaux synthétiques ; runtime, mobile, Safari et production non validés. Aucun panneau entièrement certifié.

## Reprise isolée du 23 octobre

Delta Logs seul réappliqué sur main `a1da69ae`, sans ascendance #768. [Recette combinée locale](logs-main-2026-10-23/README.md) : deux succès directs aux deux largeurs, Clear/Reload, panne réseau puis Retry réel et rechargement complet ; aucun DELETE. Build et six gardes d’inventaire passent. Non déployé, pas de certification production ou runtime.
