---
id: BUG-PREVIEW-THUMBNAIL-WAIT-20261027
section: "Preview et vignettes"
---

# Capture de vignette sans échéance et initialisation du stockage automatique

## 📤 Dispatché

☑ 27/10 — diagnostic sur main `0d6b2edfb`, après observation d'une preview rendue et d'une capture manuelle encore occupée après 109 secondes.

## 💻 Codé

☐ — correctif local validé, publication et livraison non établies.

## ✅ Testé live

☐ — aucune nouvelle capture ni modification du projet client par cette session.

## Chemins et preuves

Le bouton manuel utilise `getDisplayMedia`, lecture vidéo, encodage PNG,
demande BFF d'URL signée puis PUT direct. Ce chemin n'utilise pas le
screenshotter. Ces attentes n'avaient aucune échéance côté navigateur.
Le spinner dépend du `finally` de cette promesse : une étape suspendue
empêche donc sa libération. L'étape réellement suspendue en production
n'est pas connue ; une absence d'accès ne permet pas de la déduire.

Le chemin automatique appelle le screenshotter puis `putObject`, sans
initialiser le bucket contrairement au contrat du chemin manuel. Une
reproduction isolée avec bucket absent échoue, puis ignore une nouvelle
demande 109 secondes plus tard : l'échec réservait cinq minutes de debounce.
Le résultat `scheduled: true` est une planification, pas une preuve de PNG stocké.

Le screenshotter n'hérite pas du cookie du navigateur utilisateur. Une preview
privée peut refuser son accès ; aucun changement de partage ou contournement
d'authentification ne fait partie de ce correctif.

## Limites

Aucun appel AI, bucket réel ou credential créé. Les opérations de stockage
existantes n'offrent pas d'annulation : une écriture déjà engagée reste en vol
jusqu'à son règlement. Aucune vignette artificielle ne remplace une capture.

## Correctif et validation isolée

La capture navigateur expire après 30 secondes ; acquisition d'URL signée et
PUT ont chacun un budget de 15 secondes. Une permission accordée tardivement
arrête immédiatement le flux, les ressources vidéo sont libérées et les
requêtes réseau sont interrompues. Le timeout reste distinct de l'annulation
utilisateur : le `finally` existant libère le bouton et le toast d'erreur reste
visible. Une surface explicitement écran/fenêtre est refusée ; le navigateur
ne garantit toutefois pas l'identité de l'onglet choisi.

Le capturer serveur initialise le bucket selon le contrat déjà utilisé pour
l'upload manuel. Seul un stockage réussi réserve cinq minutes ; un échec
permet une nouvelle demande après cinq secondes, sans lancer de retry autonome.
Le verrou reste actif pendant une opération de stockage non annulable.

Sept régressions client rouges avant correction, puis 15 tests verts ; trois
régressions serveur rouges, puis 19 tests capture et routes verts. Revue
indépendante favorable avec 25 tests rerun. Une requête PUT réelle vers un
serveur HTTP local silencieux expire à environ 15 secondes et la fermeture
de connexion est observée côté serveur. Ces preuves ne sont pas une recette
du partage d'écran réel ni du projet client.
