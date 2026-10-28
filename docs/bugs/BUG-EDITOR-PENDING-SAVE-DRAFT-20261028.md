---
id: BUG-EDITOR-PENDING-SAVE-DRAFT-20261028
section: "Editeur et persistance"
---

# Protéger le brouillon jusqu'à confirmation de toutes ses sauvegardes

## 📤 Dispatché

☑ 28/10 — investigation du blocage E2E #828, sur main `9ec6ebf75`.

## 💻 Codé

☐ — correctif isolé Workbench, pas intégré à main.

## ✅ Testé live

☐ — aucune modification ou recette de données client.

## Preuves isolées

Avec les vrais WorkbenchStore, EditorStore et FilesStore, une écriture runtime
suspendue publie son contenu optimiste. Répéter l'événement éditeur de ce contenu
retirait `unsavedFiles`, car il était comparé à cette valeur optimiste. Après rejet
de l'écriture, la synchronisation restaurait ORIGINAL à la place de DRAFT.
Deuxième reproduction : une frappe SECOND pendant la sauvegarde de FIRST était
marquée propre à la réception de FIRST, puis écrasée. Les deux tests ont échoué
avant correction. Une troisième régression rouge couvre les sauvegardes A/B en
file alors que le brouillon est revenu à A.

Le correctif compte les confirmations pendantes par liaison de projet et chemin.
Un événement éditeur pendant une écriture conserve la protection du brouillon.
Une confirmation ne nettoie que le contenu capturé et seulement après la dernière
sauvegarde pendante. Le compteur est libéré en `finally`, aussi après échec.
La publication optimiste FilesStore, les conflits explicites et l'assertion E2E
stricte restent inchangés.

## Limites de causalité

L'échec CI de `ide-file-tab-identity.spec.ts:161` est rapporté sur le run
40738904398 (trois tentatives). Les courses ci-dessus sont reproduites, mais le
lien exact avec chacune de ces tentatives n'est pas établi sans leur chronologie.
La réussite d'une recette isolée ne vaut pas recette de production.

## Validations locales

- 260 tests stores/éditeur/index verts ; 42 tests rejoués par revue indépendante.
- Typage officiel du monorepo et lint verts (52 avertissements préexistants).
- Revue indépendante favorable après ajout de la protection multi-sauvegardes.
- Les écritures des régressions sont suspendues/rejetées par un runtime synthétique ;
  aucun fichier client ou fournisseur IA n'est utilisé.
