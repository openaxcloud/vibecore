---
id: BUG-IDE-PANEL-RESOLUTION-001
---

## Bug

**`?panel=…` ne résout pas vers le panneau demandé ; en-tête et contenu peuvent désigner deux panneaux différents.** Constaté LIVE en prod (`app.e-code.ai`, session Avi, desktop 1255×963) : `?panel=agent` rendait le panneau **Extensions** (`[data-testid="ide-service-panel"][data-panel="extensions"]`, onglet « Extensions » `aria-selected="true"`) ; l'en-tête « Agent » coiffait le contenu « Déploiements » ; à froid `?panel=studio` → Vue d'ensemble et `?panel=debugger` → Git. Trois causes cumulées : (1) `IDE_URL_PANELS` n'incluait ni `agent` ni `chat`, et `readPanelSearchParam` (`app/utils/project-ide-panel-url.ts:5`) renvoie `undefined` pour toute clé hors liste blanche — la valeur était **jetée en silence** ; (2) `activeMobileServicePanel` retombait **en dur** sur `'deployments'`, ce qui capturait 25 des 50 clés d'onglets mobiles, dont `agent`, l'un des trois onglets mobiles par défaut ; (3) l'en-tête venait de `mobileServiceHeaderTab` (dérivé de `activeMobileOpenTabId`, monté tardivement) alors que le contenu venait de l'URL. Correctif : registre unique `app/lib/ide/panel-registry.ts` (clés canoniques + 18 alias + résolution explicite `canonical

## 📤 Dispatché

alias

## 💻 Codé

unknown

## ✅ Testé live

empty`), URL canonisée pour les alias, clé inconnue signalée puis retirée de l'URL, en-tête et contenu alimentés par le seul entonnoir `setMobileIdePanel`. Résidus traités : `ECODE_MOBILE_MANAGEMENT_PANEL_TABS` (table vide) supprimée, `web` devient alias de `preview`, `console.log(transcript)` retiré.

## Preuve

✅

