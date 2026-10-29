# README / retour B→A — synthèse lecture seule

Sources consultées: `/workspace/ui840-b-a-diagnostic/README.md`, `editor-initial-files-flaky-840.md`, sources actuelles `tests/e2e/ide-editor-focus-handoff.spec.ts:209`, `tests/e2e/ide-mobile-file-restore.spec.ts:628`, `FileTree.tsx`, `GitStatusBadge.tsx`, `diagnostics/mobile-navigation.ts`.

Aucun test/navigateur/serveur/CI démarré, aucune source ou assertion modifiée, aucun artefact téléchargé, aucun runtime ou API client. Les résultats CI ci-dessous proviennent des notes déjà conservées, pas d'une nouvelle exécution ou d'une nouvelle lecture GitHub.

## Deux symptômes distincts

840, tête10263a1375432737ce4d008835e80e8f77d166cd, job123185092658 (run non confirmé): ouverture initiale Files1280x900, README exact introuvable30s à ligne234; retry4,8s réussi. Échec AVANT focus/Enter/Monaco/redimensionnement390. Setup API locale isolée réussi ne garantit pas archive/coque ensuite chargée. Ce n'est pas une preuve de régression du transfert de focus.

834, run40762282501, tranche2 job123097327035: retour B→A768; routeurA idle et archiveA200 achevée; CodeMirror absent5s,3tentatives échouées. Pas de fuite de contenuB sous identitéA démontrée. Recettes locales antérieures:3/3stateful et3/3CPUx4 seulement au retour passent. CPUx4 dès ouverture:2/3échecs avant Retour, pas reproduction834. Synthétique à768 ne revalide pas le setup API réel isolé/desktop du testCI.

## Parcours exact à reproduire, après coordination

840: créer projet+conversation+transcript+ide-state puis importer ZIP README unique via API locale isolée; installer blocage mutations après setup; ouvrir1280 Files; attendre le locator actuel `.bolt-file-tree-node` visible dont texte total matche `^README\.md$`, sans modifier30s. Seulement après sa présence effectuer focus/Enter et resize. Première preuve recherchée au moment de l'échec: tree total/visible, noms `.bolt-file-tree-name` README, texte total de la ligne SYNTHÉTIQUE et présence badges, GET archive phase/status, coque/panneau actif, JS errors.

834: préparer A audit et B project-b; mémoriser sélection; remplacer archiveA avec README provisoire sans audit; ouvrirA à768 editor; sélectionner explicitementREADME via Files; navigation même documentB; vérifierB et mémoires séparées; ajouter audit à archiveA; bloquer GET réel archiveA; Back; attendreA appliqué idle; vérifier absenceB; libérer archive200; conserver assertionCodeMirror TEMPORARY-README5s. Au moment échec relever CodeMirror/Monaco présents/visibles, placeholder no-file, surface keepalive et document/adaptateur en attente.

## Hypothèses et prochaines preuves

- README840: locator exact sur TEXTE TOTAL peut exclure un fichier visible avec badge/statistiques. Confirmé structurellement: NodeButton englobe enfants; GitStatusBadge ajoute displayCode+label sr-only. Non prouvé dans DOM de l'échec. Ne pas élargir locator avant cette preuve.
- Absence réelle de tree, tree caché, archive non reçue, coque remplacée restent possibles pour840.
- 834: document non résolu, adaptateur en attente, surface inactive/coque remplacée sont possibles. Archive200 seule ne prouve pas montage CodeMirror.
- Pas de cause commune établie. Hook histoire mobile ne souscrit pas au desktop1280/pointeurfin; aucunPOP dans840.
- Observateur mobile existant collecte route/header/busy mais pas compteurs tree/Monaco/CodeMirror; insuffisant pour départager. Lire trace/error-context déjà produits via accès autorisé serait première preuve utile, sans téléchargementSBOM ni relanceCI.

Aucun correctif produit justifié par ces preuves. Aucun nouvel essai local lancé: coordination serveur encore requise. Zoom/WebKit hors périmètre de ce sous-agent.
