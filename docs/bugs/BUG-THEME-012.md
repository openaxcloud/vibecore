---
id: BUG-THEME-012
---

## Bug

**P2 — mention légale et « Back to home » des pages d'auth sous AA en thème clair.** « By signing in, you agree to our Terms and Privacy Policy », sur les 3 formats.

## 📤 Dispatché

☐

## 💻 Codé

☑

## ✅ Testé live

☐ **Reproduit live 31/08, correctif poussé**

## Preuve

**Reproduction** (mêmes pixels rendus) : **3,91 à 4,40:1** selon l'endroit du dégradé. **Cause racine** : le fond de la colonne du formulaire n'est pas blanc mais un dégradé CHAUD qui descend jusqu'à `#e1d6d2`, alors que `--vc-auth-muted` (`#626970`) était calibré pour du blanc. **Correctif** : `#545a60` → **4,90:1** sur le fond le plus défavorable, en restant plus clair que `--vc-auth-secondary` donc la hiérarchie tient.

