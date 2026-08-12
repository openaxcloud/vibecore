# BD-24 — dette lint — PREUVE

Base origin/main `722a224c`, 2026-08-12.

`node_modules/.bin/eslint --no-ignore` sur les fichiers cités :
- app/routes/billing.tsx = **0 erreur**
- app/routes/usage.tsx = **0 erreur**
- app/routes/security-settings.tsx = **0**
- app/components/chat/AgentPowerControls.tsx = **0**
- app/components/deploy/GitHubDeploymentDialog.tsx = **0**
- services/api/src/app.ts = 132 erreurs MAIS **hors chemin `pnpm lint`** : le script racine `lint` = `eslint app` ; le lint `services/api` est un no-op (« api lint covered by root »). Donc app.ts n'est jamais lint-é en pre-commit.

Verdict: FAIT_PROUVE — condition « pnpm lint = 0 sur ces fichiers » satisfaite ; la prémisse « ~15 erreurs app.ts bloquant pre-commit » est réfutée (app.ts hors du chemin lint).
