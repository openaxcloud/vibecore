---
id: BUG-AGENT-MESSAGE-STREAM-SCOPE-20261028
section: "Agent et messages"
---

# Progression limitée au message actif et erreurs de lanes visibles

## 📤 Dispatché

☑ 28/10 — audit agent/messages demandé ; base main `9ec6ebf75`.

## 💻 Codé

☐ — correctif isolé, pas intégré à main.

## ✅ Testé live

☐ — aucune invocation fournisseur ni recette production.

## Reproductions

Trois régressions rouges dans les vrais composants Messages et AssistantMessage :

- Une ancienne lane interrompue sans annotation finale redevient running lorsque
  le drapeau global de streaming passe à vrai pour une autre réponse.
- Un message sans prose contenant uniquement une annotation terminale de lane
  failed est caché, malgré un panneau capable de rendre cette erreur.
- Les badges mode/coût comptent comme contenu visible alors qu'ils sont masqués
  dans l'IDE, laissant une coquille vide avec menu.

## Correction

La liste transmet l'activité de la réponse visible courante au composant ; les
anciens messages ne partagent plus cette activité. Les messages système/masqués
ne deviennent pas propriétaires du flux. L'arrêt de la liste prime sur le drapeau
global. Les erreurs/rapports de lanes seuls restent visibles. Les badges masqués
ne créent plus de bulle vide. Sans flux ni résultat agrégé, le panneau n'annonce
plus une finalisation indéfinie.

Les reçus d'écritures et les preuves QA conservent leur contrat : aucun texte
modèle ne devient une confirmation d'application ou de test exécuté. Le correctif
ne répare pas une erreur fournisseur, ne relance pas une génération et ne modifie
pas BaseChat, Chat.client, Workbench, le sélecteur ou les budgets.

## Limites

Les composants sont réels ; les annotations et services périphériques des tests
sont synthétiques. Le cas lane terminale seule prouve le contrat de rendu, pas
qu'une route production omet actuellement l'orchestration. Une réponse réellement
vide sans erreur ni annotation ne devient pas artificiellement une réussite.

## Validation isolée

- Trois régressions échouent avant correction ; 101 tests assemblés passent après.
- 45 tests rejoués indépendamment, revue favorable.
- Typage officiel complet et lint verts (52 avertissements préexistants).
- Aucune preuve de recette production ou d'appel fournisseur n'est revendiquée.
