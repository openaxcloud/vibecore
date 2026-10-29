---
id: BUG-GIT-REMOTE-FEEDBACK-20261028
---

# Erreur invisible et soumissions répétées du dépôt Git distant

## Bug

Sur la base locale `3170d2fe8`, une sélection de dépôt suivie d'un échec HTTP
ne montre pas l'erreur : celle-ci n'est rendue que dans le formulaire personnalisé
alors fermé. Deux activations dans le même cycle peuvent aussi envoyer deux
demandes. Une réponse après le démontage déclenche encore le callback et le toast.

Le montage canonique dans GitTab démonte le panneau lors du changement de contexte.
Le POST initial conserve sa cible originale : aucune écriture ou fuite interprojet
n'est démontrée. Le correctif invalide les réponses du contexte quitté, mais
n'annule pas une requête déjà envoyée au serveur.

Le lot local ajoute une garde synchrone par projet/espace, respecte l'état busy
et affiche aussi l'erreur lorsque le formulaire personnalisé est fermé. Le backend,
OAuth et les accès fournisseur restent inchangés.

Reproduction : cinq nouveaux cas rouges et deux témoins verts. Après correction,
22 tests passent (neuf nouveaux et treize existants), avec lint et typecheck verts.
La revue indépendante est favorable. Les tests utilisent des réponses isolées ;
ils ne prouvent pas une connexion réelle à GitHub. Aucun nouveau défaut de vignette
n'a été reproduit dans l'audit adjacent.

Un contrôle clavier distinct a reproduit trois défauts dans le formulaire nommé
`role="dialog"` non modal : absence de focus initial, Escape sans fermeture et
Close laissant le focus sur la page. Le complément local place le focus URL
uniquement après ouverture explicite et restitue l'ouvreur disponible après une
fermeture manuelle. Il ne piège pas le focus et ne le déplace pas après une réponse
réseau ou une navigation. Les 31 tests de composants passent ; revue, lint et
typecheck restent verts. La recette clavier navigateur du complément passe ses
deux cas à 320/1440 px dès la première exécution : ouverture et restitution du
focus, Escape et Close au clavier, zéro POST de raccordement. Ce build est distinct
du précédent reçu de deux scénarios réseau à réponses contrôlées.

## 📤 Dispatché

☑ 28/10/2026 — lot Git local distinct des PR #831 et #834.

## 💻 Codé

☐ — correctif local, non publié, non fusionné et non livré.

## ✅ Testé live

☐ — aucune connexion fournisseur ni recette authentifiée en production.
Deux scénarios navigateur locaux passent directement à 320/1440 px, sans retry
ni skip : double activation avec une seule requête, erreur visible, reprise et
fermeture clavier. Les GET fournisseur et les POST de raccordement 503/200 sont
des réponses contrôlées dans le navigateur, sans appel au fournisseur. Le build
client/SSR réussit avec les sources gelées pendant la compilation.
