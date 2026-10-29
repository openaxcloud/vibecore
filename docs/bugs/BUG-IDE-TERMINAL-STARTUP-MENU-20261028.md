---
id: BUG-IDE-TERMINAL-STARTUP-MENU-20261028
---

## Bug

L’arrivée de la mémoire IDE remplace la coque de démarrage alors que le menu Terminal est utilisé : le menu disparaît et le focus revient au document.

## 📤 Dispatché

☑ 28/10/2026 — diagnostic après le verdict E2E rouge de #837 ; correctif UI distinct des sessions et commandes runtime.

## 💻 Codé

☐ main — travail local, aucune fusion ni livraison.

## ✅ Testé live

☐ production — trois recettes finales Chromium locales réussies à390/768/1280, API synthétiques ; aucune commande Terminal exécutée.

## Preuves

La tranche 2 de #837 (`40771911457`, job `123112810366`, tête `e71e328ed`) échoue sur le scénario clavier Terminal1280 : deux fois le menuitem est absent, puis la troisième tentative observe son détachement pendant ArrowDown. Les autres dimensions de ce scénario passent. Les journaux seuls ne prouvent pas la cause CI.

Sur le build intégré `20e0860d0`, retarder GET ide-state, ouvrir le menu puis libérer la réponse reproduit le remplacement de la coque et la perte de focus. La recette du sélecteur de profil échoue ensuite strictement à 390, 768 et 1280 px, avec ancien nœud déconnecté et zéro erreur JavaScript. Données, archive et runtime sont synthétiques et isolés ; les requêtes externes et mutations sont bloquées.

Reçus de session : `/workspace/ui838-terminal-handoff-browser/red-profile-bounded/receipt.json` et `red-profile-compact/receipt.json`. Le premier diagnostic sans limite d’action a été arrêté et remplacé par un harness borné ; aucune CI n’a été interrompue ou relancée.

## Contrat de correction

Le chargement de ChatImpl ne doit pas être retardé pour conserver le focus. Le prototype qui attendait la sortie de la barre Terminal a été rejeté en revue. Le transfert doit rester éphémère, isolé au projet/workspace/fenêtre/panneau et à l’emplacement du terminal, sans commande rejouée ni état runtime modifié. Une fermeture volontaire, navigation ou interaction extérieure ne doit pas rouvrir un menu.

Les trois tests clavier existants restent inchangés. Une régression dédiée retarde la mémoire, focalise le profil, observe le remplacement puis vérifie focus, Escape et sortie Tab à 390/768/1280.

## Limites distinctes

Le retour B→A de #834 reste non résolu : son test attend déjà le routeur stabilisé avant la réponse archive. Aucun lien causal avec ce menu Terminal n’est établi. La recette ne valide ni SSH, ni persistance des sessions, ni exécution des commandes, ni appareils physiques.

## Résultat final local

[Reçus et captures avant/après](ui-terminal-startup-handoff-evidence-20261028/README.md). Trois recettes compilées réussies après correction complète : ancien nœud réellement détaché, profil/menu conservés, Shift+Tab, Escape et Tab natifs, zéro erreur JavaScript.

La réservation se place au-dessus de ClientOnly/Suspense pour le Terminal mobile actif. Les initialiseurs de surface et d’onglet reconnaissent immédiatement la route canonique Terminal et l’alias Shell, au lieu de passer par Agent. Les annulations d’interaction/navigation/démontage sont testées ; aucun délai ni readiness Chat modifié.

52 tests Terminal/startup passent (37+15), avec contre-exemples rouges/verts sur fermeture, focus extérieur, montage différé et route initiale. Gardes AST/mobile préservées : empreinte rescellée après comparaison exacte du seul wrapper sans DOM dans la tranche gelée. Build final, typage web final et typage complet avant les derniers deltas web réussis. Aucun résultat production revendiqué.
