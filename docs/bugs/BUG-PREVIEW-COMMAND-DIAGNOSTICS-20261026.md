---
id: BUG-PREVIEW-COMMAND-DIAGNOSTICS-20261026
section: "Runtime et preview"
---

# Les logs de commande perdent le code, le signal et le type de sortie

## 📤 Dispatché

☑ 26/10 — diagnostic sur main `90d92ff12`.
## 💻 Codé

☐ — correctif local testé ; non fusionné et non déployé.
## ✅ Testé live

☐ — aucun redémarrage ni commande sur le projet client.

## Reproduction isolée

Le sérialiseur `workspaceLogLines` transforme un événement de sortie avec
`exitCode: null` et `signal: SIGKILL` en la seule ligne `exit`. Une erreur
`COMMAND_TIMEOUT` ne conserve que son message. Stdout et stderr ne sont plus
distinguables. Les événements synthétiques exercent le code réel, sans processus
ou données client.

Les répétitions de `preview.proxy.unreachable` ne prouvent pas des crashes :
un workspace `Running` et un port détecté ne garantissent pas qu'un serveur HTTP
réponde. Le compteur de logs n'est pas un compteur de redémarrages. La cause du
503 réel et du démarrage intermittent reste ouverte.

## Périmètre

Conserver les informations de diagnostic déjà reçues dans le flux, les bornes
de rétention et les protections d'arrêt. Ne pas ajouter de payloads, variables
d'environnement ou secrets aux logs. Aucun changement du serveur `app.ts`, des
permissions, de la cadence de retry ou de la configuration de production.

## Validation locale

Cinq assertions échouent sur le sérialiseur initial ; 87 tests ciblés passent
après correction, incluant la récupération preview et les actions rechargées.
Le helper est importé par le chemin réel de logs du workbench. Les lignes
stdout/stderr gardent leur contenu ; les événements conservent le type et les
métadonnées disponibles, sans inventer un code numérique pour un signal.
