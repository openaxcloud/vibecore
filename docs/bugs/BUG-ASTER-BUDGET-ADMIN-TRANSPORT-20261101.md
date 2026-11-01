---
id: BUG-ASTER-BUDGET-ADMIN-TRANSPORT-20261101
section: "Agent et budget"
---

# Transport administrateur pour l’enveloppe autorisée

## 📤 Dispatché

☑ 01/11 — vérifier un parcours utilisable sans console navigateur ni copie de session.

## 💻 Codé

☐ — raccord local séparé de la PR API #879 ; non livré.

## ✅ Testé live

☐ — aucune connexion, activation ou invocation fournisseur réelle.

## Constat

La PR #879 expose une API administrative limitée à Aster, mais aucun écran,
outil ou script opérateur existant ne cible cette opération. Les pages admin
possèdent déjà le transport serveur `apiRequest` et la réauthentification
`/auth/reauth` à partir de la session existante. L’écran des portefeuilles agit
sur un autre registre ; il ne faut pas l’utiliser pour cette extension ni
modifier directement les paramètres système.

## Raccord minimal

La nouvelle page normale `/admin/explicit-budget` dépend de #879. Son chargement
lit uniquement le projet autorisé, les soldes et le maximum calculé pour la
carte active. Aucun montant, projet, fournisseur ou plafond global n’est éditable.
La confirmation explicite et le mot de passe administrateur passent au serveur
par le formulaire habituel. Aucun jeton/cookie ne doit être copié par l’opérateur.

Le serveur impose le rôle admin, l’origine, les champs autorisés et compare la
proposition affichée à une lecture fraîche avant puis après réauthentification.
Il envoie une seule fois la proposition exacte de l’API. Seule la relecture d’un
grant conservant le baseline permet un succès confirmé. Les refus HTTP restent
des refus ; une réponse perdue n’entraîne aucun deuxième POST automatique.
La page distingue le résultat inconnu et efface le mot de passe lors d’une
soumission ou relecture. Le digest de revue n’est pas un credential.

## Utilisation après livraison

L’administrateur ouvre normalement `/admin/explicit-budget`, vérifie Aster,
l’organisation, les soldes et le permis Lite/OpenAI/Luna Standard. Il coche la
confirmation et saisit lui-même son mot de passe dans ce formulaire officiel.
Le résultat attendu est un plafond de 30,52 USD, les 15,26 USD historiques
conservés et 15,26 USD restants. Si le run supplémentaire a déjà réservé son
maximum, le restant peut être zéro ; aucune nouvelle extension n’est proposée.
La page ne lance jamais l’essai IA. L’absence de rôle admin ou d’une
réauthentification valide reste bloquante, sans nouvel accès ni contournement.

## Preuves locales et limites

24 tests du transport serveur utilisent les vrais helpers de session et des
réponses API synthétiques : session relayée côté serveur, cookies non transmis
au service, données sensibles absentes des réponses, refus et incertitude.
12 tests du vrai composant et de React Router couvrent la confirmation, les
soldes, la réauthentification, le résultat inconnu, la relecture et EN/FR.
La revue a relevé puis fait corriger le faux succès possible sur un grant non
corrélé. Le mot de passe conservé pendant une relecture et les refus HTTP
explicites ont leurs contrepreuves rouges/vertes.

Ces tests ne sont pas une activation réelle ni une recette navigateur de
production. L’opérateur doit vérifier la version servie avant l’unique essai.
