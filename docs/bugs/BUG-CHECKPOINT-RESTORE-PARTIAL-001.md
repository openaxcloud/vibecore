---
id: BUG-CHECKPOINT-RESTORE-PARTIAL-001
section: "Reprise commerciale du 2026-10-20 — restauration de checkpoint"
---

## Bug

**P1 — une reprise combinée modifie les fichiers avant le refus de la base et répond en succès.**
Le BFF restaure d'abord les fichiers, puis tente la base. Le refus DB est transformé en
`ok:true` avec avertissement ; le client peut alors remplacer sa conversation et recharger.
L'échec de restauration de la mémoire de l'agent est également journalisé sans changer
le succès HTTP. La copie générique « aucune modification » ne prouve pas l'absence de
mutation lorsqu'une requête a déjà été envoyée.

Contre-revue complémentaire : un checkpoint de conversation sans snapshot reste
cliquable et saute le POST, puis remplace la mémoire avec `clearMessages:true`.
Le refus du BFF seul ne protège donc pas ce chemin client.

## 📤 Dispatché

Contre-revue du 20 octobre reproduite ; correction candidate et tests ajoutés au lot #743.

## 💻 Codé

✅ Correctif fusionné par #743 le 20 octobre à 13:31:39 UTC, commit
`9c8f6bc6d95a97ddf54a52a932a6c07aff4f2828`. Il refuse la demande combinée avant toute écriture,
après lecture autorisée du projet. Il conserve les reprises explicitement fichiers seuls.
Une reprise des fichiers suivie d'un échec mémoire répond en échec partiel, HTTP502,
et les erreurs inconnues n'affirment plus que l'état est inchangé. Aucun moteur de
restauration DB coordonnée n'est livré. Le candidat refuse également les checkpoints
sans identifiant de snapshot dans le callback, avant toute requête ou sauvegarde
de mémoire, et désactive leurs actions dans les deux listes et la confirmation.
Le test du vrai callback donne 12 cas rouges et deux témoins verts sur `7c103096`,
puis 14/14 verts après correction. Après rebase sur main : 90 tests ciblés verts,
build client/serveur vert, trois formats du navigateur compilé préservant quatre
messages après refus du checkpoint sans snapshot. Hook global réussi et 32 contrôles
GitHub terminés (30 succès, deux sauts) sur la tête exacte `72d2322`. Les contrôles
de main et le déploiement restent distincts ; aucune preuve HTTPS public disponible.

## ✅ Testé live

❌ Pas de restauration physique ni de preuve de production. Les reprises fichiers seules
et les résultats partiels sont testés au niveau de l'orchestration avec frontière API
contrôlée. Après recompilation, quatre refus HTTP réels (EN/FR, formulaire/JSON)
passent avec état PostgreSQL inchangé ; les trois formats navigateur passent également.

## Preuves

Sur le chemin initial d'e40/e8ede22 : 14 assertions rouges et un témoin vert dans les
15 nouveaux cas. Dix échecs concernent les garanties de sécurité (six valeurs affirmatives,
autorisation avant mutation, échec mémoire, deux dates invalides) ; quatre autres
concernent le nouveau format explicite de résultat. Le témoin est l'arrêt après refus
du POST fichiers. Après correction, les 15 cas passent ; le parcours fichiers seuls
reste testé avec champ absent, chaîne `false` et booléen JSON `false`.

Suite complémentaire : 55 tests réussis dans cinq fichiers, dont copie d'erreur EN/FR,
refus non mutateur et résultat partiel. [Contexte et limites](../reprise/2026-10-20-restauration-integrite.md).

Dernière preuve intégrée : contrôles `nosnapshot-` du 20 octobre, 12:42–12:43 UTC.
Trois captures inspectées, zéro POST de restauration et conversation persistée
inchangée ; quatre refus BFF réels avec état PostgreSQL inchangé. Le runtime de la QA
est indisponible ; aucune application générée ou restauration physique revendiquée.
Un libellé d’action reste tronqué dans les rangées étroites de l’historique.
