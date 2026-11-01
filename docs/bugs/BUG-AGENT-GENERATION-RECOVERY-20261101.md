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

## Complément de revue : reçu final en concurrence

La première tête a révélé un défaut supplémentaire en revue : un PUT concurrent
pouvait faire échouer la persistance du reçu final avec 409, puis le serveur
ne gardait que son journal. La reproduction PostgreSQL impose une barrière
après la lecture du perdant : le PUT concurrent gagne avant l'écriture finale.

La correction réconcilie une seule fois un conflit PostgreSQL dont l'écriture
a été annulée, sous verrou de la seule ligne existante et délai borné. Elle
attache le reçu à un contenu identique, complète son préfixe strict, conserve
une version plus longue et refuse un contenu divergent ou un autre verdict.
Le hash est validé avant toute confirmation. Aucun appel fournisseur ni retry
réseau n'est ajouté. La confirmation du journal repose sur le reçu effectivement
retourné par l'API, pas seulement sur un HTTP réussi.

Sept courses contrôlées sont vérifiées dans les deux tests PostgreSQL, avec
conservation des conflits ordinaires. Les 10 tests API et 37 tests BFF/helper
passent. Un nouvel échec de base de données reste non confirmé ; ce mécanisme
ne constitue pas une garantie absolue de stockage pendant une indisponibilité.

La CI de la première tête `fab6f71f` s'est arrêtée au contrôle i18n (trois
nouvelles chaînes d'erreur). Les libellés ont été intégrés au catalogue EN/FR
sans élargir la baseline ; le scanner et les 19 tests du catalogue passent.
Cette ancienne CI ne valide pas la tête corrigée.

La tête suivante `25a7b9f3d` a passé i18n, typage et sécurité, mais la suite
unitaire complète a détecté un second test de câblage exigeant encore l'ancien
comptage par segment (11 443 réussites, un échec, quatre skips). Le test exige
désormais un unique comptage du contenu concaténé, son ordre après accumulation
et l'absence de l'ancien comptage. Les 41 tests ciblés route/câblage passent ;
aucune assertion comportementale ni contrôle n'est retiré. La tête suivante
requiert sa propre CI complète.
