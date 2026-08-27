# BUG-IDE-PANEL-RESOLUTION-001 — captures avant / après

## Avant (prod `app.e-code.ai`, 2026-08-27, session Avi, desktop 1255×963)

Mesuré au DOM, pas à l'œil :

| Adresse demandée | Ce qui s'affichait | Preuve |
|---|---|---|
| `?panel=agent` | Panneau **Extensions** | `[data-testid="ide-service-panel"]` → `data-panel="extensions"` ; onglet « Extensions » `aria-selected="true"` |
| `?panel=deployments` (après rechargement) | **Sécurité**, puis **Git**, puis **Journaux** — l'URL, elle, ne bougeait pas | relevés successifs de l'onglet actif et de l'en-tête |
| en-tête vs contenu (mobile) | en-tête « Agent » au-dessus du contenu « Déploiements » | `mobileServiceHeaderTab` dérivait de `activeMobileOpenTabId`, le contenu de l'URL |

Détail complet et méthode : [`../../IDE_UX_AUDIT_2026-08-27.md`](../../IDE_UX_AUDIT_2026-08-27.md), section P0-2.

## Après (branche `fix/ide-panel-resolution`, pile locale, Chromium 1280×720)

Produites par `tests/e2e/ide-panel-routing.spec.ts` — le test échoue si l'URL affichée
et la surface rendue divergent.

| Capture | Adresse demandée | Résultat vérifié |
|---|---|---|
| `ide-panel-routing-agent.png` | `?panel=agent` | Dock Agent ouvert, **aucun** panneau de service rendu, URL `?panel=agent` |
| `ide-panel-routing-chat.png` | `?panel=chat` | Alias canonisé : URL réécrite en `?panel=agent`, dock Agent ouvert |
| `ide-panel-routing-studio.png` | `?panel=studio` | Onglet **Agent Studio** actif, en-tête « Agent Studio », contenu `data-panel="studio"` |
| `ide-panel-routing-debugger.png` | `?panel=debugger` | Contenu `data-panel="debugger"`, URL inchangée |
| `ide-panel-routing-web.png` | `?panel=web` | Alias canonisé en `?panel=preview`, Webview rendue |
| `ide-panel-routing-unknown.png` | `?panel=definitely-not-a-panel` | Paramètre **retiré** de l'URL, message à l'utilisateur, **aucun** repli sur `deployments` |

Rejouer :

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 SAAS_API_URL=http://127.0.0.1:3001 npx playwright test tests/e2e/ide-panel-routing.spec.ts --project=chromium
```

## Portée honnête

Ces captures viennent d'une **pile locale sur la branche**, pas de la production : le
correctif n'est pas déployé. Elles prouvent le comportement du code livré, pas l'état
de la prod. Le point ne passe ✅ dans `BUG_INVENTORY_LIVE.md` qu'après merge et
vérification sur `app.e-code.ai`.
