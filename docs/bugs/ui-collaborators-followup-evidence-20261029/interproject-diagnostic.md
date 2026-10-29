# Retour B→A, diagnostic indépendant — 29 octobre 2026

Aucune source, assertion ou configuration du dépôt modifiée. Aucun build, serveur ou workflow démarré/arrêté par cette session. Navigateur Chromium local sur le serveur21999 fourni par le parent, build f96ddd270 ; API/archives/état IDE synthétiques isolés, runtime bloqué, aucun appel IA. Les navigateurs se ferment en finally.

## Preuve CI lue

PR834 run40762282501, job tranche2 123097327035 (l'agrégateur cité initialement est123114084997). Test `tests/e2e/ide-mobile-file-restore.spec.ts:628`, assertion757 : après retour A, routeur appliqué idle, archive HTTP200 terminée, `.cm-content` absent pendant5000ms ; même échec dans les3tentatives. Aucun contenuB sous identitéA n'est démontré par ce log. L'autre flaky1180 concerne le menu avant Escape et n'est pas une cause établie.

Aucun artefact téléchargé, aucun accès à l'hôte auparavant refusé. Le répertoire `/workspace/repro-834-navigation-20261028` du propriétaire Publish n'existe pas ici.

## Recette et résultats

`repro.cjs` : A sélectionnée audit absent, README provisoire ; sélection explicite README ; navigation même document versB ; B document distinct ; RetourA avec archive tenue jusqu'au routeur idle ; absenceB vérifiée ; libération archive200 ; même assertion de contenuA sous5000ms. Aucun seuil de dépôt modifié.

- `stateful/receipt.json` :3/3réussites à768.
- `stateful-cpu4/receipt.json` :1/3parcours complet réussi. Deux échecs AVANTRetour (montage initialA ouB dépasse5s), contenu correct déjà visible dans la sonde juste après échec. Ce ne sont pas des reproductions de l'échec834.
- `back-cpu4/receipt.json` :3/3réussites ; CPUx4 activé seulement aprèsB prêt, puis même RetourA et assertion5s.
- `baseline/receipt.json` :premier harnais invalide, GETide-state vide écrasait la sélectionB ; les essais échouaient avantRetour. Corrigé par mémoire synthétique stateful, sans modification produit. Ne pas comptabiliser ces erreurs comme défauts produit.

Différence substantielle avec CI : le test complet crée/import deuxprojets viaAPI réelle isolée, ouvre initialement desktop puis768 ; ce diagnostic prépare mémoire/archives synthétiques et reste768. Ce résultat ne revalide pas le testCI entier, ne prouve pas correction parSearch et ne certifie pas backend/production/Safari.

## Hypothèses et prochaine preuve utile

La récente invalidationPOP mobile peut réappliquer `panel=editor` lorsque la coque est conservée ; toutefois elle ne charge ni sélectionne les documents. Le focushandoff ne monte pas un éditeur manquant. `.cm-content` absent peut correspondre à document nonrésolu, adapter en attente ou coque remplacée ; le log ne départage pas. Aucun patchproduit justifié ici.

La trace déjà produite par laCI doit distinguer au moment exact aprèsarchive200 : surface mobile/keepalive active, `.cm-content` vsMonaco, placeholder «no file», étatrouteur et durée chargementadaptateur. L'observateur actuel `tests/e2e/diagnostics/mobile-navigation.ts` recueille chemin/router/header/busy mais pas ces compteurs. Une éventuelle instrumentation supplémentaire doit rester lectureseule, bornée, sans texteclient ni modification des attentes. Pas de relanceCI aveugle, ni nouvelle preuve prétendue par seule absence de reproduction.
