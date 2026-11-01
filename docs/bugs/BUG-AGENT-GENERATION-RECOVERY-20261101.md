---
id: BUG-AGENT-GENERATION-RECOVERY-20261101
section: "Agent et messages"
---

# Valider les écritures et conserver le verdict de génération interrompue

## 📤 Dispatché

☑ 01/11 — terminer le parcours réel au-delà du rendu de conversation ; analyse sur main a9f8b02b.

## 💻 Codé

☐ — branche isolée, validation et revue en cours ; aucune intégration ni livraison revendiquée.

## ✅ Testé live

☐ — aucune mutation du projet utilisateur, aucun appel IA payant. Les preuves ci-dessous sont locales.

## Défauts reproduits

- Une balise de fichier coupée entre deux segments de continuation est concaténée correctement, mais comptée séparément : verdict incomplet erroné malgré un protocole fermé. Les compteurs décrivent l'émission, pas l'application.
- Le chemin direct du runner écrit encore du TSX invalide après deux réparations épuisées et produit un reçu d'écriture. Un projet sain compile avant ce chemin, puis son vrai build Vite échoue.
- Une écriture partielle streaming peut remplacer le fichier sain ; une fermeture de contenu identique est dédupliquée avant validation. Le runner termine sans réparation, avec un fichier invalide sur disque.
- Du CSS dont le bloc est non fermé passe les validations actuelles. Vite seul peut le tolérer avec un avertissement ; une chaîne Vite/PostCSS réelle échoue. Ce n'est donc pas un échec universel de tout build Vite.
- Une fermeture de secours peut appliquer un fichier syntaxiquement valide mais tronqué. Elle devient une proposition incomplète sans écriture, jusqu’à une vraie fermeture du protocole.
- Le transcript persistant perd le reçu terminal. Une extension encore tronquée peut arrêter le polling de reprise avant que le serveur possède la suite complète.

Les reproductions utilisent des fichiers temporaires, de vrais processus Vite/TypeScript et des doubles de fournisseur explicitement isolés. Les erreurs rapportées sur un projet production ne suffisent pas à attribuer son interruption à l'un de ces défauts.

## Contrat visé

Le streaming reste visible dans l'éditeur, mais n'est pas une écriture durable ni un reçu d'application. La fermeture valide le fichier avant écriture ; une réparation épuisée ne peut ni appliquer le code invalide ni multiplier son budget via les retries d'outil. Les fichiers sains et les modifications concurrentes sont conservés sans rollback aveugle.

Le reçu terminal est un constat de transport associé au contenu, pas une preuve de build, de QA ou de facturation. Sa persistance est additive et protège les écritures tardives par conflit explicite. Une reprise déjà autorisée reste bornée et attend un verdict terminal plutôt qu'une simple augmentation de texte. Un nouvel appareil sans état durable de Stop n'autorise pas automatiquement le rejeu des fichiers.

## Limites de validation

Une syntaxe valide ne prouve pas les types, le build, le démarrage, le comportement fonctionnel ou la complétude du besoin. La reproduction locale contient un TypeScript accepté par les parseurs et compilable par Vite, mais refusé par un vrai `tsc`. Aucune réparation manuelle du projet utilisateur ne sera présentée comme réussite du produit. Aucun plafond ni droit persistant n'est élargi.

## Diagnostic distinct des préférences et du budget

Le ledger des runs explicites se lit dans la feuille Lite/Power du composeur,
avec un modèle explicite sélectionné. Il affiche les réservations projet et le
reste de cette enveloppe, pas le coût total historique Auto/fournisseur. Un
montant « Estimated cost » de Settings/Usage n'est pas ce ledger ni une
confirmation du plafond disponible pour une nouvelle recette.

Reproduction séparée avec la vraie ChatBox : Lite et le modèle explicite
survivent à un remontage dans le même stockage local. Un contexte sans ce
stockage revient à Power/Auto ; le hook prévu pour hydrater les préférences du
mode depuis le serveur n'a pas de consommateur. Le choix de modèle explicite
reste, lui, uniquement local et par mode. La migration depuis la seule clé
legacy Lite est aussi masquée par le défaut Power de la lecture moderne.
Ces constats ne prouvent pas la cause du cas production signalé après
réouverture ; aucun réglage ou plafond n'est modifié par ce lot.

## Preuves locales et limites de reprise

La régression runtime/stores comporte 973 tests réussis sur 83 fichiers, dont
une fixture disque réelle pour la fermeture de secours et l'hydratation d'un
historique. Une action historique peut être affichée `complete` sans aucune
lecture ni écriture runtime et sans reçu : son libellé n'est pas une preuve
qu'un fichier a été rejoué. Les réparations fournisseur de ces tests sont des
doubles locaux, sans appel payant.

La persistance du verdict dispose de 111 tests application et de 10 tests API,
dont deux scénarios PostgreSQL réel sur une base temporaire migrée. La migration
0093 est additive ; elle n'a pas été appliquée en production par cette tâche.
Le reçu lie le verdict au texte normalisé, mais n'est pas une attestation
inforgeable, une preuve d'application ou une autorisation d'exécution.

Le marqueur d'interruption reste conservé même après un verdict de transport
`complete` : il empêche une relance automatique du prompt tant que ses effets
ne sont pas réconciliés. La reprise récupère le texte et son verdict ; elle ne
répare pas automatiquement une application et ne relance pas les fichiers sur
un nouvel appareil. La cause terminale de l'ancien essai production reste
inconnue sans son reçu initial. Aucun résultat de génération payante nouvelle
n'est revendiqué.

Typage officiel complet et build production client/serveur réussis. Lint global :
0 erreur, 52 avertissements après correction du formatage d’un test. Revue
indépendante favorable ; la CI distante et la recette production restent distinctes.
