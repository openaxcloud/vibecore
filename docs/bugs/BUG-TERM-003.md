---
id: BUG-TERM-003
---

## Bug

**P1 — l'identifiant de session du panneau Terminal DÉRIVAIT à chaque montage, donc un panneau ne rattachait jamais son propre shell.** `TerminalStore.attachTerminal` forgeait `sessionKey = user-${#terminals.length}` (`app/lib/stores/terminal.ts`). Le commentaire affirmait que c'était stable par panneau ; c'était faux : `#terminals` ne fait que CROÎTRE — un spawn en échec n'ajoute rien, la fermeture d'un panneau ne retire rien, chaque remontage empile une entrée — donc l'index montait à chaque cycle. L'agent clé son shell sur `?sessionId` : c'était donc une session NEUVE à chaque fois. Sur l'offre gratuite (limite 1), la demande était refusée en 429 et le panneau restait bloqué sur « Connexion à l'espace de travail… » indéfiniment. **Sans rapport avec BUG-QUOTA-001** : le quota faisait exactement son travail (refuser un 2e terminal réellement distinct).

## 📤 Dispatché

📤 **Dispatché**

## 💻 Codé

💻 **Codé — mergé sur `main` (PR #140, merge `35222455`)**

## ✅ Testé live

✅ **TESTÉ LIVE 17/08 — rattachement après rechargement prouvé à l'écran**

## Preuve

Env d'audit, `web:601a649f54` + `api:8a5ea8564d`, offre gratuite (`terminals.concurrent` = 1), **un seul panneau utilisateur**. À l'écran, terminal RATTACHÉ après rechargement de page : `echo hi` → **`hi`** → invite rendue (capture : [`docs/audit/evidence/BUG-TERM-003/01-rattachement-apres-rechargement-echo-hi.png`](docs/audit/evidence/BUG-TERM-003/01-rattachement-apres-rechargement-echo-hi.png)). Décompte serveur corrélé par `reqId` sur la même fenêtre : `terminal-user-1` **8 connexions → 0 × 429**, `terminal-managed` **8 → 0**. L'identifiant NE DÉRIVE PLUS : 8 connexions successives sur le MÊME `sessionId` à travers plusieurs rechargements. AVANT correctif, même scénario : identifiants qui grimpaient (`terminal-user-3` puis `terminal-user-6`) et **27 × 429** avec panneau mort. Contrôle intermédiaire à 3 panneaux ouverts : `user-1` 0 × 429 (le créneau), `user-2`/`user-3` **27 × 429 chacun** — le quota refusant correctement 3 terminaux pour une limite de 1. 4 tests neufs (`app/lib/stores/terminal-pane-session-key.spec.ts`), repro rouge→vert : les 4 échouent sur le code d'avant (`user-0, user-1, user-2` pour trois montages du MÊME panneau). ⚠️ Formats tablette/mobile non vérifiés (desktop 1440 uniquement).

