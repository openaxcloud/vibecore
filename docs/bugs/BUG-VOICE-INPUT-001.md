---
id: BUG-VOICE-INPUT-001
---

## Bug

**P2 — Zone de saisie, bouton micro (dictée) sur iPhone : « il faut améliorer l'enregistrement de voix et le comportement quand on clique dessus, on comprend rien, c'est mal fait »** (Avi, 07/09, capture 08:18 : icône micro barré entourée en rouge). Mesuré avant correction (Chromium 390, moteur Web Speech factice piloté par la sonde ; WebKitGTK n'a pas l'API, le bouton y est caché) : à l'appui `start()` sans langue (`lang` vide) ; l'icône passe à « micro barré » — qui se lit « micro coupé » — et rien d'autre ne change (placeholder identique, aucun indicateur, pas d'`aria-pressed`) ; la dictée REMPLACE le texte déjà tapé (« Bonjour  » → « je veux une page ») ; le moteur n'est écouté que sur `result` et `error` : quand il s'arrête seul (silence — ce que fait Safari iOS après quelques secondes), l'interface reste « en écoute », l'appui suivant appelle `stop()` dans le vide, et il faut un troisième appui pour repartir ; `no-speech` se tait.

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main` — PAS EN PROD au 07/09 11:00 UTC, porte refusée : Production CI rouge sur l'empreinte du bloc gelé de BaseChat, re-scellée par 247eb27 ; redéploiement à confirmer) — machine à trois phases (repos / demande / écoute, `dictee-vocale.ts`) ; `onstart` / `onend` écoutés ; langue de l'interface donnée au moteur (fr → fr-FR) ; la dictée prolonge le texte tapé ; icône micro (jamais barrée) + halo qui pulse + couleur d'alerte pendant l'écoute, `aria-pressed`, région `aria-live` ; le champ dit « Autorisation du micro… » puis « Je vous écoute… Parlez, puis appuyez sur le micro pour arrêter. » ; erreurs traduites (micro absent, réseau, silence en info). Épinglé par `app/components/chat/dictee-vocale.spec.ts` (machine, langue, fusion, erreurs), `app/components/chat/dictee-vocale-cablage.spec.ts` (câblage `onend`/`onstart`/langue/préfixe, icône, placeholder, halo) + `tests/e2e/ide-mobile-chrome.spec.ts` « dictée vocale » (moteur factice : langue, placeholder, aria-pressed, halo, préfixe gardé, fin du moteur → repos, un seul appui relance, silence dit). **Non vérifié sur le moteur réel de Safari iOS** : à confirmer sur iPhone.

## ✅ Testé live

☐

## Preuve

07/09 08:18.

