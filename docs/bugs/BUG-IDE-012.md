---
id: BUG-IDE-012
---

## Bug

**P1 — L'IDE IGNORE le thème choisi et repasse en clair, puis épingle TOUTE l'application en clair.** Avec une préférence sombre posée, l'accueil, le tableau de bord et les Paramètres s'affichent bien en sombre ; l'IDE seul revient au clair. Pire : en y passant, il écrit une préférence « clair » que l'utilisateur n'a jamais exprimée, laquelle est ensuite recopiée dans le cookie partagé et fige toutes les surfaces.

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

☐ *(corrigé + rouge→vert ; à certifier live après déploiement)*

## Preuve

**Mesuré live 19/08** sur l'env de test, **même cookie `ecode_theme=dark`, même session, même navigateur** — seule la page change : `/` déconnecté → `data-theme=dark` ✅ · `/` connecté → `dark` ✅ · `/dashboard` → `dark` ✅ · `/settings` → `dark` ✅ · **IDE `/@demo-proof-org/froid-vide-a1` → `light`** ❌, avec `bolt_theme=light` écrit dans un `localStorage` pourtant vierge au départ. **Faux départ écarté d'abord** : le sombre existe bien (forçage manuel de `data-theme=dark` → fond `rgb(10,15,28)`), le cookie EST vu par la page (`document.cookie` le contient), et les pages publiques de l'env de test **comme de la prod** l'honorent parfaitement aux deux valeurs — ce n'était donc ni un bundle périmé, ni un cookie mal posé, ni un piège de fixture. **Cause racine** : `resolveProjectThemePreference` (alors dans `app/components/chat/BaseChat.tsx`) descendait « préférence du projet → bascule par origine `bolt_theme` → défaut clair » **sans jamais lire le cookie partagé `ecode_theme`**, qui est pourtant ce qui porte le choix fait sur les autres surfaces. Le commentaire en place justifiait de ne pas suivre `prefers-color-scheme` — règle juste, et conservée — mais elle avait été étendue par erreur au choix **explicite** de l'utilisateur, qui n'est pas une indication d'OS. **Deuxième moitié du défaut** : `applyProjectThemePreference` persistait le thème résolu **même quand il ne venait d'aucun signal**, fabriquant une préférence jamais exprimée que `initStore` recopie ensuite dans le cookie partagé — d'où l'épinglage global. **Correctif** : le résolveur sort dans `app/lib/stores/project-theme.ts` (le tester depuis `BaseChat` démarrait le WebContainer et cassait la suite sur un fetch parasite de `/inspector-script.js`) ; il consulte le cookie partagé dans la branche `system`/non renseigné ; un cookie à `system` n'est **pas** un choix et retombe sur le défaut, donc on ne suit toujours pas l'OS ; `bolt_theme` n'est plus écrit que pour un choix réel (`explicite: true`). **Preuve rouge→vert** : `app/lib/stores/project-theme.spec.ts`, 6 tests — en neutralisant la seule ligne de lecture du cookie, **2 passent au rouge** ; correctif remis, 6/6 verts. PR #177. **⚠️ LIEN À RETENIR POUR LE SUIVI** : ce défaut est très probablement DERRIÈRE plusieurs des « défauts clair/sombre » signalés par Avi dans l'IDE. Tant qu'il était présent, l'IDE s'affichait en CLAIR quoi qu'on demande — donc (a) toute capture « sombre » de l'IDE antérieure au déploiement de #177 est en réalité une capture claire, la mienne du 19/08 comme celles des passes précédentes, et (b) un écart de contraste constaté « en sombre » dans l'IDE pouvait en fait être un composant clair jugé sur une palette sombre. **À faire avant de traiter le moindre défaut clair/sombre de l'IDE comme un bug distinct** : le rejouer sur l'IDE réellement sombre, post-#177. Plusieurs entrées pourraient tomber d'elles-mêmes.

