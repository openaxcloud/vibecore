---
id: BUG-IDE-COMPOSITION-HANDOFF-20261026
---

## Bug

Sur le build local 62a072e97, la saisie continue ordinaire à 80 ms puis 20 ms conserve le texte exact malgré le remplacement initial. Aucun buffer de touches n'est justifié par ces résultats.

En revanche, le scénario de composition piloté par Chromium CDP distingue le contrôle stable (`日本Z`) du remplacement pendant composition (`日本`, continuation absente). Le document reste focalisé mais l'éditeur est remplacé et le focus retombe sur BODY. Cette preuve est limitée au protocole Chromium ; aucun IME matériel ou Safari réel n'est déclaré validé.

## 📤 Dispatché

26/10/2026 — audit de la limite de saisie demandé. Travail isolé sur fix/ide-composition-handoff-20261026, issu de 62a072e97 ; lot précédent et #799 inchangés, aucune publication autorisée.

## 💻 Codé

☐ — local seulement. Signal de composition natif Monaco, par éditeur et par portée. Le passage de PendingComposerShell à ChatImpl attend la fin native de composition et du geste pointeur éventuel. Une fois activée, l'interface ne revient pas à la coquille lors d'une composition ultérieure. Aucune interception, mise en tampon ou réinjection des touches ; la frappe ordinaire ne bloque pas la transition.

## ✅ Testé live

☐ — aucune validation production. 54 tests package et 33 tests app/catalogues/garde AST passent ; typecheck et build package strict réussis. Revue indépendante favorable. Recette navigateur compilée : 17 scénarios validés, dont 15 au premier passage et 2 après correction de deux défauts de harnais (sélecteur ambigu puis journal exigeant un éditeur visible après passage à Search). Aucun retry automatique ni nouveau build pour ces corrections de test. La composition reste dans le même éditeur jusqu’au commit natif ; après remplacement, `日本Z` est conservé exactement. Le clic réel vers Search puis la saisie de README atteignent le champ voulu. Les cas IME et clic extérieur passent aussi au zoom Chromium natif 200 %. Le texte ordinaire rapide et les régressions précédentes restent verts. Reçus et captures dans `ide-composition-2026-10-26/`.

## Limites

Le correctif vise le remplacement lié à l'arrivée de l'historique dans Chat. Les remplacements plus précoces des fallbacks ClientOnly/Suspense ne sont pas couverts par cette preuve et cette correction. Les tests utilisent des fixtures synthétiques avec API et base locales réelles, sans fournisseur ni données client.
