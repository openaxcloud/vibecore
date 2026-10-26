---
id: BUG-IDE-TAB-FOCUS-20261026
---

# BUG-IDE-TAB-FOCUS-20261026 — restitution intermittente du focus après Échap

## 📤 Dispatché

26/10/2026 — audit des panneaux IDE, branche dédiée depuis main `798fa0f251dec690f81ebd11f0c43eae76c98ba6`.

## 💻 Codé

☐ — correctif local en validation, aucun correctif de ce lot livré.

## ✅ Testé live

☐ — aucune recette authentifiée en production ni Safari matériel.

## Constat

Sur main #797, le test `ide-panel-visibility.spec.ts:83`, cas « panel visibility 390px › tabs closes with Escape and restores focus », constate le menu fermé mais le bouton `button-tab-switcher` sans focus. Le second essai passe : ce résultat intermittent ne valide pas la restitution du focus.

Preuve : [E2E 40253275690, tranche 2](https://github.com/openaxcloud/vibecore/actions/runs/40253275690/job/121349704445). Le lot global est vert avec un cas flaky. La cause est maintenant reproduite localement : le remplacement de PendingComposerShell par ChatImpl détruit le déclencheur focalisé et sa référence. Un menu restauré via sessionStorage ne conserve pas sa cible de retour. Retenir puis libérer le vrai GET ide-state reproduit les deux scénarios (menu ouvert ou déjà fermé), 2/2 échecs sans retry sur main798fa0f25. Une série initiale non contrainte de huit essais était verte et ne suffisait donc pas à conclure.

## Périmètre et validation attendue

Reproduire et instrumenter le focus avant correction. Vérifier clavier, fermeture/réouverture et panneaux IDE aux largeurs 320/390/820/1440 ainsi que le zoom 200 %, avec états vides et erreurs isolés. Préserver le menu inférieur mobile/tablette. Exclure pages hors IDE, hub Intégrations et backend. Aucune fusion avant livraison confirmée du lot prioritaire #798.

## Correction et preuves

Un contexte éphémère limité au projet, espace et fenêtre conserve une cible logique, pas un nœud DOM détruit. La nouvelle coquille restaure le focus une fois ; elle ne le reprend pas à un contrôle extérieur. Le menu inférieur et les fournisseurs ne changent pas. La recherche saisie n’est pas transmise par ce correctif de focus.

- [Preuves du défaut et captures](ide-panel-focus-2026-10-26/focus/)
- [Matrice locale et zoom natif](ide-panel-focus-2026-10-26/qa/README.md)

Revue indépendante : ancien déclencheur périmé après une ouverture sans cible détecté, corrigé et couvert par un neuvième test. Avis favorable sur le delta final ; recette compilée finale 8/8, sans retry, passée. Typecheck web strict et lint passés. La tentative tsc globale non partitionnée a dépassé son heap4GiB ; elle ne constitue pas un contrôle réussi.

## Garde de la zone mobile conservée

La première CI de #799 (`a67a0fd46`, run40258563741/job121365666398) échoue sur une garde AST : `ref={setChatRootRef}` modifie l’empreinte de la tranche JSX gelée. 10 375 tests passent, 4 sont ignorés et 1 échoue. Le correctif compose la référence hors de cette tranche (`forwardedRef` vers le callback local `ref`) et conserve exactement `ref={ref}` dans le JSX. Le test et son empreinte attendue ne sont pas modifiés. Les 7 gardes AST et 9 tests de focus passent après cette correction ; la revue indépendante confirme l’absence de récursion et la transmission du démontage au parent.

Après reconstruction exacte de cette composition, les huit scénarios navigateur passent à nouveau sans retry en27,4s. Les reçus successifs restent distincts ; aucun hash de garde changé.
