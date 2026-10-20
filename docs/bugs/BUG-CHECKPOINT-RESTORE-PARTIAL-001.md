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

## 📤 Dispatché

Contre-revue du 20 octobre reproduite ; correction candidate et tests ajoutés au lot #743.

## 💻 Codé

❌ Pas encore fusionné. Le candidat refuse la demande combinée avant toute écriture,
après lecture autorisée du projet. Il conserve les reprises explicitement fichiers seuls.
Une reprise des fichiers suivie d'un échec mémoire répond en échec partiel, HTTP502,
et les erreurs inconnues n'affirment plus que l'état est inchangé. Aucun moteur de
restauration DB coordonnée n'est livré.

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
