---
id: BUG-AGENT-SCROLL-RESIZE-RACE-20261027
section: "Génération et orchestration"
---

# Agent : une remontée du fil est annulée par un redimensionnement immédiat

## 📤 Dispatché

☑ 27/10 — reproduction locale isolée, puis intégration au complément UI Agent.

## 💻 Codé

☐ sur main — correctif local validé, publication et livraison encore attendues.

## ✅ Testé live

☐ — aucune recette authentifiée ou donnée client ; Chromium local et contenu synthétique.

## Cause et correctif

Le traitement de scroll attendait1ms avant de sortir de l'ancrage en bas. Un ResizeObserver intervenant entre la remontée et ce traitement voyait encore isAtBottom=true et ramenait le fil au dernier message ; le bouton de retour restait absent. La reproduction sur le hook React réel passe de top2863 à0, puis2993 après resize.

La sortie de l'ancrage est maintenant enregistrée synchroniquement lors d'une remontée loin du bas. Les écritures programmatiques internes, une animation explicitement non interruptible et le clamp près du nouveau bas restent exclus. Aucune modification du moteur de génération, des actions clavier ou des données.

## Preuves et limites

[Preuves du lot Agent](ui-agent-evidence-2026-10-27/README.md). La recette isolée comporte neuf tests unitaires (deux régressions rouges avant correction) et douze cas Chromium :390/768/1024/1440 × remontée normale, resize immédiat après scroll, scroll natif+resize. Le clic du bouton est vérifié jusqu'à l'arrivée réelle en bas.

Le harness isolé importe le vrai hook mais ne reproduit pas tout le shell IDE. WebKit n'a pas été exécuté localement : binaire absent et installation refusée HTTP403 « Domain forbidden », sans contournement ni nouvelle tentative. Le lien causal avec le flaky WebKit CI n'est pas établi. Les résultats du build intégré sont distingués dans le README du lot.
