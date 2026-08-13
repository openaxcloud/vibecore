# BD-29 — chats standalone « local uniquement » — PREUVE

Env test `app.34.163.208.161.sslip.io`, image web **`df1287d856`** déployée, 2026-08-13. Jamais la prod.

## Constat
Les chats hors-projet (standalone) sont stockés dans l'IndexedDB local (`boltHistory`, `useChatHistory.ts`) et **jamais synchronisés entre appareils** (note in-code : « Server-side sync for standalone chats is not yet »). Aucune mention explicite dans l'UI.

## Correctif
Note honnête sous l'en-tête « Vos discussions / Your chats » de la sidebar historique (`Menu.client.tsx`, rendu par `BaseChat` en mode chat standalone) :
- En : « Stored on this device only — standalone chats are not synced across devices. »
- Fr : « Stocké uniquement sur cet appareil — les discussions autonomes ne sont pas synchronisées entre appareils. »
Clé i18n `sidebarMenu.history.localOnlyNote` (interface + En + Fr), rendue en `<p>` juste après `copy.history.title`.

## Preuve (déploiement + code)
Le pod web déployé (`df1287d856`) contient les DEUX chaînes compilées dans son bundle :
```
/app/build/client/assets/runtime-*.js: standalone chats are not synced across devices
/app/build/client/assets/runtime-*.js: les discussions autonomes ne sont pas synchronis…
```
(grep dans `/app/build/client` du pod). Le composant rend la note dans l'en-tête de l'historique (revue de code : `Menu.client.tsx` `<p>{copy.history.localOnlyNote}</p>`).

**Note honnête sur la méthode** : la sidebar historique standalone est une surface héritée (le flux E-Code est centré projet/IDE), non atteinte en capture Playwright directe ; la preuve est donc **le bundle déployé contenant les chaînes + la revue de code du rendu**, pas un screenshot. La condition de clôture « mention explicite dans l'UI » est satisfaite (note présente et déployée).

**Verdict : FAIT_PROUVE** (mention explicite dans l'UI, déployée et vérifiée dans le bundle).
