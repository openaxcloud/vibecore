---
id: BUG-SECURITY-FONT-001
---

## Bug

**P3 — Onglet Sécurité : la taille de police n'est peut-être pas celle du reste du produit** (Avi, 08/09 08:2x, point 5 : « pour la tab sécurité est-ce que c'est la même taille de police que ce qu'on a fait partout ? »). À MESURER avant de conclure — le rapport d'échelle des captures Replit est 3,0 px par px CSS (recalibré le 08/09), pas 3,2 : les tailles dérivées le 07/09 pour l'onglet Secrets sont donc sous-estimées d'environ 7 % et le même biais peut toucher Sécurité.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

**MESURÉ, et la réponse est NON** — panneau contre panneau à 390 px, sur la feuille de styles réelle : Secrets rend son titre `h2` à **22px**, Sécurité rendait son `h3` à **12px**, soit PLUS PETIT que le texte qu'il coiffe (13-14px). Son `h3` ne porte aucune classe : il tombait dans la remise à plat de la coque, exception que Secrets avait et que Sécurité n'avait pas. Corrigé et re-mesuré : **12px → 22px**. ⚠️ **La moitié restante est ouverte, et je ne la livre PAS à l'aveugle** : onze lignes de détail (`.bolt-panel-row-detail`, `text-xs`) restent à 12px là où le même rôle vaut 13px ailleurs, et AUCUNE règle de feuille ne les atteint. Vérifié dans la page : le sélecteur correspond (`el.matches` → vrai), la règle est bien dans la feuille SERVIE, et pourtant `.bolt-panel-row-detail{font-size:41px!important}` réinjectée en dernier laisse 12px — alors que la MÊME valeur posée EN LIGNE donne bien 41px. Le témoin positif prouve que la mesure fonctionne ; la cause reste introuvable. Livrer une règle dont je ne peux pas démontrer l'effet serait du CSS décoratif.

