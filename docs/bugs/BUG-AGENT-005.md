---
id: BUG-AGENT-005
---

## Bug

**P0 — l'application DÉPLOYÉE perd tout son responsive : le balisage de la plateforme est écrit DANS le CSS et devient un sélecteur.** Au plafond de jetons en plein `src/index.css`, le modèle repart dans le même message ; la prose et le balisage sont écrits dans le fichier :\n`…height:14px}Je continue exactement là où le fichier CSS s'est arrêté…` puis `<boltArtifact id="expense-tracker-finish">` puis `<boltAction type="file" filePath="src/index.css">`. **L'effet est pire qu'une pollution** : ce texte brut est parsé comme un SÉLECTEUR, si bien que TOUTES les règles suivantes se retrouvent préfixées `.skeleton`. La media query livrée ne contient donc plus que `.skeleton .summary-grid{grid-template-columns:1fr}` — qui ne matche aucun nœud réel. Résultat mesuré sur l'app déployée en 390px : `matchMedia('(max-width: 480px)')` = **true**, mais `.summary-grid` reste en `repeat(3,1fr)` et le document déborde (`scrollWidth` 706 pour 390). Cartes coupées (« MOYEN… », « 183,5… »), formulaire et historique côte à côte. L'aperçu DEV, lui, empile correctement — le défaut n'apparaît qu'une fois déployé. ⚠️ **Cause réelle — corrigée le 17/08 après avoir DÉMENTI ma première hypothèse.** J'avais écrit ici que c'était l'écriture de « matérialisation streaming » côté client qui figeait le partiel corrompu : **c'est faux**, un test dédié (`app/lib/runtime/message-parser.css-restart.spec.ts`) montre que le parser client traite déjà correctement cette forme, y compris avec un `<boltArtifact>` intercalé et une troncature au milieu d'un token. Le vrai coupable est le chemin **SERVEUR** (`services/api/src/app.ts`), qui extrait les fichiers avec `/<boltAction\b([^>]*)>([\s\S]*?)<\/boltAction>/` : lors d'un redémarrage il n'y a qu'UN seul `</boltAction>`, tout à la fin, donc la capture paresseuse avale le partiel tronqué + la prose + le balisage de reprise, et persiste le tout. C'est ce chemin qui alimente le storage projet ET le build de déploiement — ce qui explique pourquoi l'aperçu DEV était correct et l'app publiée cassée. Corrigé dans `cf5437aa` (`services/api/src/bolt-file-actions.ts`, 5 tests) : quand un ouvrant apparaît dans le contenu capturé, seul le segment qui suit le DERNIER ouvrant est retenu, et ce sont ses attributs qui font foi.

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 17/08 ; correctif non revalidé live** (revalider demande un rebuild de l'image `api` sur l'env de test partagé)

## Preuve

Env de test, image `web:2565e5edc3` (contient `dacad880`), projet `cmswzyoyv000d0nheglytwpep`, workspace `ws-85434e36e4694fa6`, déploiement `cmsx5vkjb02s60nbrh2ss4nux` (statut `READY`). CSS servie : `/assets/index-DuKT5OFm.css` — 3 `@media` présentes, toutes portant le préfixe parasite `.skeleton`. Source : `grep -c 'boltAction\

