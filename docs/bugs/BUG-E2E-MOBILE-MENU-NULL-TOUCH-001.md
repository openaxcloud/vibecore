---
id: BUG-E2E-MOBILE-MENU-NULL-TOUCH-001
section: "2026-10-21 — Fiabilité des recettes IDE"
---

## Bug

Le scénario `ide-mobile-chrome.spec.ts` des menus Agent/Économique à 390 px mesure séparément le bouton avec `boundingBox()`, puis applique `touchscreen.tap()` aux coordonnées obtenues. Si la géométrie est indisponible pendant le remplacement du composeur, le repli `?? 0` déclenche un appui à (0,0), hors du bouton demandé.

Reproduction locale sur le produit exact de #758, `736ed190d64a980471e5943cf7e0695195f2a691`, arbre `05fc66c81ee9f02592b06cca5cf715b69dc19714` : 20 répétitions instrumentées du scénario inchangé donnent 19 succès directs et un succès après retry. La tentative rouge atteint le timeout historique de 150 s. La trace montre `touchscreenTap {x:0,y:0}`, puis un événement ciblant `button-back`, la navigation `/ide` vers `/dashboard`, et une nouvelle attente de `.bolt-chatbox-mode-trigger` désormais absent. Les battements de diagnostic continuent jusqu'au timeout : cette attente n'est pas une preuve de blocage du moteur JS ni de Monaco.

La trace ne sérialise pas explicitement le retour JavaScript null de `boundingBox()` ; le repli est identifié par le code et l'appui (0,0) effectivement enregistré. Une revue indépendante confirme la chaîne. L'attribution vaut pour cette reproduction locale ; les traces CI refusées au téléchargement n'ont pas été inspectées.

## 📤 Dispatché

☑ Diagnostic isolé de la fixture mobile, sans modifier les têtes validées #749 et #758.

## 💻 Codé

☐ Pas fusionné dans main. Deux appuis deviennent `Locator.tap()` : déclencheur et entrée du menu. Playwright résout la cible tactile et sa disponibilité lors de l'action, y compris après détachement. Aucun `force`, timeout, assertion, attente, boucle d'essais, retry, navigateur CI ou exemption n'est modifié. Aucun code produit n'est modifié. Le correctif supprime une navigation accidentelle du test ; il ne certifie pas l'absence de tout autre défaut du composeur.

## ✅ Testé live

☐ Aucune livraison ni certification de production. Le canari WebKit de la pilule de retour en bas reste distinct et non résolu : WebKit n'est pas installé dans ce banc et aucun téléchargement refusé n'a été retenté.

## Preuves locales

Résumé vérifiable sans données de session : [mesures et empreintes](mobile-menu-touch-evidence.json).

Racine sauvegardée : `/workspace/monaco-layout-evidence/`.

- Build production de #758 réussi (`mobile-flake-baseline-build.log`), mode par défaut sans `VITE_RUNTIME_MODE` forcé ; API réelle et stockage local du banc.
- Témoin non instrumenté : 5/5 succès directs ; premier diagnostic : 5/5. Ces premiers verts ne suffisaient pas à écarter le flake.
- Témoin instrumenté répété : `mobile-flake-diagnostic-repeat20.json`, 19 succès directs, 1 flaky, zéro omission, 410,079 s. Configuration et scénario copiés avec sondes de cycle DOM, événements tactiles et navigation, sans remplacer les réponses API.
- Trace rouge : `mobile-flake-diagnostic-repeat20/ide-mobile-chrome-chrome-d-1f72e-omposeur-visibles-à-l’écran-chromium-repeat11/trace.zip`, SHA-256 `88e1de43782adc4fcc39ea3b9f5fb49465a0d57d6a31e1c614a7ee5247873415`. Retry conservé, SHA-256 `485b54a5a53d8b5676f97ea0b5754747b7a0fbf4b2a6d003791fc98309364ff6`.
- Trois essais contrôlés retenant puis libérant la vraie réponse `ide-state` conservent la même géométrie avant/après remplacement ; ils ne reproduisent pas le défaut à eux seuls. Une première version invalide de cette sonde (contexte sans tactile) a été interrompue et conservée sous `mobile-controlled/` ; ses erreurs ne sont pas des échecs produit.
- Candidat instrumenté : `mobile-flake-fixed-repeat20.json`, **20/20 succès directs, zéro retry utilisé, zéro omission**, 266,988 s. Même produit, instrumentation, filtre et configuration que le témoin rouge ; seules les deux actions tactiles du test changent.
- Candidat original sans instrumentation : `mobile-flake-fixed-original5.json`, **5/5 succès directs, zéro retry utilisé, zéro omission**, 82.278 s.
- Chromium système 154.0.8037.57 : limite explicite par rapport au navigateur CI exact. Un worker ; retries historiques conservés et comptabilisés. Aucun chargement lourd lancé simultanément aux mesures.

Commande du témoin et du candidat instrumentés (config locale conservée, seule la source copiée du scénario change) :

```sh
pnpm exec playwright test --config=/workspace/monaco-layout-evidence/playwright.mobile-diagnostic.config.ts --project=chromium --grep 'zone de saisie : les menus' --repeat-each=20 --reporter=line,json --output=/workspace/monaco-layout-evidence/<serie>
```

La copie diagnostique et son générateur `prepare-mobile-diagnostic.py` sont conservés dans la même racine. Le scénario original non instrumenté peut être exécuté avec `playwright.mobile-baseline.config.ts` et le même filtre.
