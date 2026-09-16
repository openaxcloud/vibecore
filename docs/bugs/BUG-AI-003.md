---
id: BUG-AI-003
---

## Bug

**Conclusion PRECEDENTE ERRONEE, corrigee ici** : on avait conclu « aucun trafic IA depuis midi, donc personne ne s'en sert ».

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **A REMESURER apres livraison de BUG-AI-001**

## Preuve

Le 01/09, l'absence totale de message d'assistant apres 12:29:46 (mise en service du correctif #312) avait ete lue comme une ABSENCE D'USAGE, sur la foi des journaux de la passerelle qui ne montraient que des sondes de sante. **C'etait faux, ou au minimum non demontre** : BUG-AI-001 etablit que la generation etait cassee — un appel sur deux chemins (non-streaming en 500, streaming en 200 vide). Une absence de messages ecrits ne prouve donc PAS une absence de demandes. Le taux « apres » de #312 (55,2 % de messages vides AVANT) reste **non mesure**, et il devra l'etre sur une fenetre posterieure a la livraison de BUG-AI-001, pas avant. Lecon : ne jamais deduire « personne ne s'en sert » de l'absence d'ECRITURE, quand le chemin d'ecriture lui-meme peut etre casse.

