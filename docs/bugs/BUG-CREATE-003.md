---
id: BUG-CREATE-003
---

## Bug

**P1 — un pod d'espace de travail survit à l'arrêt de son enregistrement (fuite + aperçu mort).** Trois lignes `STOPPED` côté manager avaient toujours leur pod `Running`, dont une depuis **6 heures** (`ws-85434e36e4694fa6`, ligne STOPPED à 14:30, pod démarré à 08:54). Conséquence utilisateur : l'IDE lit les fichiers depuis le pod vivant (tout a l'air normal) mais `preview-proxy` refuse de résoudre l'agent d'un espace STOPPED → **404 `PREVIEW_AGENT_NOT_FOUND` en boucle toutes les ~3,4 s, indéfiniment**. Conséquence exploitation : des pods facturés qui ne servent plus rien.

## 📤 Dispatché

☑

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

**Corrigé le 10/09.** Le balayage ne réconciliait QUE l'inverse (ligne `RUNNING`, pod disparu) ; sur une ligne `STOPPED` il n'agissait qu'une fois `deleteMs` écoulé — **24 h en production**. Entre les deux, le pod tournait, et se facturait, pour personne. Branche ajoutée dans `#garbageCollect` : ligne `STOPPED` + pod encore vivant → suppression **du seul pod**, via `stopWorkspace`. ⚠️ Le piège de la règle 9 était juste à côté : la branche d'échéance (`deleteWorkspace`) détruit le **PVC**. L'emprunter ici aurait effacé le travail d'un utilisateur dont l'espace venait de s'arrêter — `STOPPED` veut dire « calcul rendu, DONNÉES gardées ». Passer par `stopWorkspace` réutilise aussi sa garde optimiste, qui relit la ligne et renonce si une réouverture l'a fait repasser en `STARTING`. épinglé par `services/workspace-manager/src/manager.spec.ts` (4 cas : le pod part ; le PVC et le Secret restent ; une réouverture est épargnée ; aucune suppression à vide quand le pod est bien parti). Contre-épreuves dans les deux sens : branche retirée → rouge ; `stopWorkspace` remplacé par `deleteWorkspace` → rouge sur la moitié PVC. ⚠️ **Testé live reste ☐** : la production est injoignable depuis cette session (403 sur le proxy), je n'ai vérifié que des gardes.

