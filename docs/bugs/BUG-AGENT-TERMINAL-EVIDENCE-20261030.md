---
id: BUG-AGENT-TERMINAL-EVIDENCE-20261030
section: 'Agent et messages'
---

# Distinguer la fin du flux, les écritures et la validation de l’application

## 📤 Dispatché

☑ 30/10 — suite de la recette interrompue, reproductions isolées sans appel fournisseur.

## 💻 Codé

☐ — branche dédiée ; publication et intégration sous coordination.

## ✅ Testé live

☐ — aucune recette production de ce correctif, aucun projet utilisateur modifié.

## Défauts établis

`onFinish` n’est pas une preuve de succès : le SDK peut appeler ce callback après
EOF sans verdict final. Le client effaçait néanmoins le marqueur de récupération
et pouvait consommer le prompt initial dès qu’un fichier avait été ajouté.
La décision de continuation pouvait aussi traiter une fin `error` ou `unknown`
sans fichier comme une simple annonce à relancer. Le budget n’est pas modifié.

Le reçu `modelOutput` prouve seulement un delta texte. Son libellé statique
« fin non confirmée » ne tenait pas compte d’un verdict terminal reçu.

L’événement `load` d’une iframe ne prouve pas que les modules de l’application
ont compilé. Une erreur reportée après cet événement laissait pourtant l’état
« Preview rendered » affiché. Les tests du vrai composant reproduisent ce défaut.

## Contrat et limites

Le verdict additif `streamTerminal` distingue `complete`, `incomplete` et `error`.
Il porte une raison normalisée et des compteurs de segments/actions/blocs ouverts,
jamais les messages, fichiers, prompts ou erreurs brutes. Une fin normale ne
certifie ni écriture runtime, ni compilation, ni QA. Les messages affichent cette
distinction dans le fil existant, sans nouvelle fenêtre.

Une interruption n’ajoute aucun appel fournisseur automatique. Les continuations
pour longueur gardent les limites existantes. Stop et navigation invalident les
callbacks différés ; les fichiers déjà confirmés ne sont pas effacés.

L’aperçu annonce uniquement le chargement de sa page et reflète les erreurs reçues
par le reporter existant. Aucun nouveau détecteur d’overlay Vite n’est ajouté :
l’absence d’erreur reportée ne prouve pas une application valide.

L’API de transcription serveur ne persiste actuellement pas les annotations.
Une réponse récupérée par ce chemin peut donc rester sans preuve terminale ;
son texte seul ne doit pas effacer l’incertitude. La récupération lit l’historique,
elle ne lance pas une nouvelle génération payante.

La cause terminale de la recette initiale reste inconnue sans identifiant du tour,
raison de fin et dernier événement serveur. Les erreurs syntaxiques persistées
et le build échoué sont établis, mais n’attribuent pas cette interruption.
Le statut fichier `aborted` peut venir d’une fin de flux ouverte autant que d’un
Stop explicite : son libellé historique « Stopped » ne prouve pas un clic utilisateur.

## Validation isolée

- 273 tests assemblés sur 24 suites : vrai décodeur SDK sur flux synthétiques,
  hook React, route BFF, parseur/actions, reprise bornée et composant Preview.
- Régressions rouges avant correction : classification terminale backend,
  effacement prématuré du marqueur, statut d’aperçu après erreur, coche de
  progression et libellé de fin de message. Aucun appel modèle requis.
- Revue indépendante favorable : 135 tests sur dix fichiers, dont callbacks
  tardifs, Stop, navigation et GET de récupération résolu après changement de portée.
- Lint applicatif : zéro erreur, 52 avertissements préexistants.
- Aucun succès de ces tests n’est présenté comme une recette production.
