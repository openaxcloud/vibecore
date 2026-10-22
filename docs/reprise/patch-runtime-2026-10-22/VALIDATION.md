# Validation historique du candidat #765

Ces résultats et `manifest.json` appartiennent à la tête antérieure. La reprise sur main `18745bd0` est documentée séparément dans [RECOVERY.md](RECOVERY.md).

- `node scripts/i18n/scan-source.mjs --check` : vert, sans modification de baseline ou allowlist.
- `node scripts/i18n/validate-catalogs.mjs` : vert, 18 815 clés anglaises/françaises correspondantes.
- Vitest, 34 fichiers (suites workbench/files et pipeline patch/JSONC/interface) : **271 tests passent**. Commande : `node node_modules/vitest/vitest.mjs run <fichiers listés dans expanded-final-green.log> --maxWorkers=2 --no-file-parallelism`.
- ESLint sur tous les fichiers TypeScript modifiés : **0 erreur, 1 avertissement préexistant**. Contrôle global app précédent : 0 erreur, 52 avertissements existants.
- Typecheck officiel : `PATH=/workspace/.cache-npm-i18n/_npx/b78ace6db0017a49/node_modules/.bin:$PATH NODE_OPTIONS=--max-old-space-size=8192 node scripts/typecheck.mjs` : web, scripts, helpers, Electron et packages passent.
- Build React Router production client + SSR : **vert**, commande `NODE_OPTIONS=--max-old-space-size=8192 VITE_CJS_IGNORE_WARNING=1 node node_modules/@react-router/dev/bin.js build`. Un seul processus de build à la fois, heap 8 GiB dans une limite mémoire de 16 GiB.

Les tests de présentation du composant sont des tests DOM, pas une recette navigateur ou une preuve de génération réelle. La relecture d'octets sur disque est couverte par le vrai workspace-agent local ; la passerelle API, Kubernetes, la génération fournisseur et le projet utilisateur ne sont pas certifiés par ce lot.

Les empreintes des sources et des journaux locaux sont dans `manifest.json`. Les rouges initiaux et intermédiaires restent conservés. Le diagnostic utilisateur ajouté n’expose pas les messages arbitraires des exceptions. Le logger.error brut préexistant de files.ts subsiste ; aucune expurgation globale des journaux n’est garantie.
