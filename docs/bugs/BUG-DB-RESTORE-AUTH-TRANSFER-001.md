---
id: BUG-DB-RESTORE-AUTH-TRANSFER-001
section: "Reprise commerciale du 2026-10-20 — restauration DB"
---

## Bug

**P1 — l'organisation autorisée par HTTP peut être perdue si un transfert
intervient avant la lecture de l'instance.**

Les deux routes de restauration autorisent le projet dans l'organisation A,
puis lisent séparément l'instance de base. Après un transfert A vers B entre
ces lectures, l'instance et le projet lus par l'admission appartiennent tous
deux à B. Leur seule comparaison ne conserve pas l'organisation A sur laquelle
les droits et l'entitlement ont été vérifiés.

La même course existe dans les GET de métadonnées/connexion et le POST de
reprovisionnement, sans activation du coordinateur. Ces chemins existaient
sur main ; aucun incident client n'est allégué.

## 📤 Dispatché

☑ 20/10 — revue indépendante de la tête `01cf9e9079a42ca9aa29324c8c9845c2f95d21a3`
de #745. Fusion suspendue. Sur cette base, six contre-épreuves PostgreSQL
échouent comme attendu : quatre demandes HTTP (deux aliases, deux
environnements) sont admises à tort avec une ligne durable, et deux admissions
directes acceptent l'instance B avec l'autorisation A. Seize autres
contre-épreuves HTTP avec un vrai transfert couvrent consultation,
reprovisionnement et réponse fournisseur tardive.

## 💻 Codé

☐ Correction locale, non fusionnée et non déployée. L'organisation autorisée
est capturée avant les lectures suivantes, transmise dans le contrat
d'admission et revérifiée sous les verrous du projet et de l'instance.
Les autres routes vérifient aussi cette portée avant accès fournisseur et
avant de rendre des données relues. Un appel fournisseur déjà admis/en vol
n'est pas annulé par ce contrôle.

Les premiers passages corrigés donnent 27 tests repository et dix tests de
routes verts ; le fichier de transfert donne 26 tests verts après adaptation
d'un ancien fixture omettant le nouveau champ requis. Le premier passage
62/63 reste conservé, sans prétendre à un unique passage 63/63.
La contre-revue a ensuite été reproduite par six échecs ciblés : quatre GET
retournent 200 après transfert pendant la lecture des snapshots ou de
l'évidence ; deux refus 409 n'utilisent pas le message traduit.
Le contrôle est désormais effectué après toutes les lectures, et le message
est actionnable en anglais et en français. Le passage du 20 octobre terminé
à **17:38:23 UTC** donne **42/42 verts, zéro saut** : 32 tests PostgreSQL/HTTP
de transfert et dix tests de routes sur store mémoire explicite. Les
tests repository restent une exécution distincte : le passage final terminé
à **17:56:18 UTC** donne **30/30 verts, zéro saut**, dont les quatre courses
des POST et les interactions réelles avec la rotation des clés. Les empreintes
des sources sont identiques à celles capturées pendant ce passage.

[Preuves structurées](../reprise/mesures/2026-10-20-restore-auth-rotation.json).

## ✅ Testé live

☐ Aucun essai en production. Le coordinateur n'est pas injecté dans le serveur
de production. Les tests utilisent de vraies transactions PostgreSQL et des
requêtes HTTP locales ; disponibilité et fournisseurs sont des fixtures
explicites. Aucun résultat cloud, navigateur ou paiement n'en est déduit.
