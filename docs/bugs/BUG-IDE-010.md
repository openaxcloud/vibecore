---
id: BUG-IDE-010
---

## Bug

**P1 (MOBILE) — l'onglet TERMINAL s'intitule littéralement « Unavailable » (en anglais) dans la feuille d'outils mobile.** Tous les autres outils portent un titre français ; seul le terminal affiche le mot de repli anglais.

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

☐ *(corrigé + rouge→vert ; à revalider live après déploiement)*

## Preuve

**Repro live 17/08, viewport iPhone 13 (390)** — env d'audit, projet réel, IDE → « Ajouter un onglet » : la liste rend l'entrée terminal comme **`"UnavailableTerminal shell de…"`** (titre = `Unavailable`, description FR correcte), au milieu de « Base de données », « Verrous », « Débogueur », « Git », « Paquets », « Compétences »… tous corrects. **Cause racine (deux pièces qui s'emboîtent)** : (1) `app/lib/mobile-ide-tabs.ts:90` stockait le **littéral** `SHELL_TERMINAL_LABEL = 'Shell (Terminal)'` dans un champ `titleKey` que le consommateur passe à `t()` (`BaseChat.tsx:3262`) — ce n'est pas une clé de catalogue, donc la résolution échoue ; (2) `app/lib/i18n/runtime.ts:502` définit `parseMissingKeyHandler: () => en['common.unavailable']`, donc **toute clé manquante rend le mot ANGLAIS « Unavailable »**, quelle que soit la langue. **Correctif, libellé gelé respecté** : la valeur `'Shell (Terminal)'` est ajoutée au catalogue sous `mobileIdeTabs.terminal.title` **à l'identique en EN et en FR**, et `titleKey` pointe désormais sur cette clé. Le libellé rendu est donc **inchangé au caractère près** — le gel et le spec Workbench tiennent. **Pourquoi ça n'avait jamais été attrapé** : `app/lib/mobile-ide-tabs.i18n.spec.ts` contenait un `resolveTitle()` qui **exemptait** le terminal, au motif que « le libellé gelé n'est pas une clé et se résout en lui-même » — hypothèse fausse à cause du `parseMissingKeyHandler`. L'exemption est supprimée : tous les titres passent par le vrai `t()`, et une assertion interdit désormais explicitement le repli `'Unavailable'` sur n'importe quel onglet. **Preuve rouge→vert** : sans le correctif, **3 tests rouges** dont le symptôme exact d'Avi — `missing-key fallback for terminal: expected 'Unavailable' not to be 'Unavailable'` ; avec, 3/3 verts.

