# P0-A2-05 — cohérence de l'échelle d'approbation (registryComplete)

**evidenceId :** `docs/deploy-evidence/2026-07-22-approval-ladder-consistency/`

Refus « sourceBaselineReady=false mais registryUniverseReady=true ; la preuve dit que les
deux échouent » réfuté MÉCANIQUEMENT sur `docs/parity/APPROVAL_STATUS.json` (COMPUTED par
`generate-approval-status.mjs`, garde anti-dérive `validate-registries`).

`verify-ladder-consistency.mjs` asserte (exit 1 sinon) :
1. **`highestPassedLevel` == plus haut niveau du PRÉFIXE contigu passé** — ici
   `contractsPresent` (le 1er niveau échoué est `contractsValidated`).
2. **Implication de la paire refusée** : `registryUniverseReady ⇒ sourceBaselineReady`
   (les deux passent aujourd'hui ; l'incohérence refusée est absente).

⚠️ L'échelle n'est **pas** strictement monotone **par conception** : les niveaux passés
au-dessus du préfixe (`verticalBackendReady`) sont des **sous-signaux indépendants**
documentés dans l'algorithme du générateur — ce ne sont PAS des trous. Le vérificateur
les liste (`subSignalsAbovePrefix`) sans les traiter comme incohérence.

`ladder-anchor.json` hashe l'état. PROVEN_REVIEW_PENDING.
