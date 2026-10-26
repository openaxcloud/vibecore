---
id: BUG-AGENT-WRITE-RECEIPTS-20261026
section: "Génération et orchestration"
---

# L'attribution d'un fichier à une lane ne confirme pas son écriture

## 📤 Dispatché

☑ 26/10 — audit isolé sur main `90d92ff12`, sans écriture de projet.

## 💻 Codé

☐ — défaut confirmé, raccordement des confirmations d'écriture non réalisé.

## ✅ Testé live

☐ — aucune modification ou relance du projet client.

## Reproduction et contrat

`ArbitreDesLanes.peutEcrire()` attribue un chemin dès l'ouverture de l'action,
avant sa fermeture ou sa persistance. `cheminsEcritsParLesLanes()` utilise ces
attributions comme fichiers écrits. Appeler les exports réels avec une demande
de fichier, sans aucune écriture, suffit à supprimer l'avertissement d'écart.
Inversement, les écritures du coordinateur ne sont pas dans cet arbitre : un
fichier finalement produit par celui-ci peut rester affiché comme manquant.

L'arbitre doit rester responsable des permissions ; un registre distinct des
confirmations d'écriture doit servir à mesurer la livraison, en tenant compte
du coordinateur. Ce raccordement n'est pas inclus dans les correctifs de
classification fournisseur et de conservation des logs de commande.

`emittedFiles` constate des blocs complets reçus, pas une persistance. Le toast
de fichiers appliqués intervient après acceptation et relecture du runtime,
sans attester une compilation ni un checkpoint cloud. Le pourcentage du plan
compte des annotations d'étape ; `complete` pour QA signifie rapport valide,
alors que `verificationState: not_observed` interdit d'en déduire un test réel.

95 tests existants du parseur, de l'arbitrage et de la progression passent.
Ils ne constituent pas une preuve que les compteurs actuels attestent les
écritures sur disque, ni que le fichier évoqué dans une capture soit absent.
