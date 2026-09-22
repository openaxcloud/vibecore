---
id: BUG-URL-FETCH-DUMP-001
---

## Bug

**P2 — « Récupérer une URL » déverse le contenu BRUT, non organisé, illisible** (Avi, 09/09 11:01, captures iPhone prod, sur `https://volt-watt.com`). Le fil affiche « [Contenu web provenant de …] Titre : … Description : … » puis UN SEUL pavé où tout le texte de la page est recollé sans structure : la navigation, les langues (« en English Français Deutsch Español Italiano »), les slogans et les chiffres s'enchaînent en une phrase continue — « Global Leader in Renewable Energy Powering Tomorrow's Energy Today Leading the renewable energy transition… ». Avi : « ça affiche le contenu pas organisé c'est incompréhensible ». Double exigence, la sienne depuis le point 8 : lisible par un non-ingénieur, et rien qui déborde.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

**CAUSE TROUVÉE ET CORRIGÉE le 09/09.** L'extracteur remplaçait CHAQUE balise par une espace (`/<[^>]+>/g → ' '`) puis écrasait tout blanc, retours à la ligne compris (`/\s+/g → ' '`). Titres, boutons et paragraphes devenaient donc indiscernables : la structure du document était détruite avant même d'arriver à l'écran, d'où la phrase continue de la capture. L'extraction est sortie dans un module testable (`app/lib/web/contenu-lisible.ts`) et CONSERVE la structure : les titres deviennent des titres, les listes des puces, chaque bloc ferme sa ligne, et seuls les blancs HORIZONTAUX sont écrasés. La navigation, les scripts, les styles et le pied de page sont écartés — du bruit dans un extrait. Bénéfice double : lisible pour Avi, et mieux structuré pour le modèle qui le reçoit en contexte. ⚠️ VÉRIFIÉ, PAS SUPPOSÉ : la même faute N'EXISTE PAS sur le chemin automatique de l'agent — le digest (`app/lib/web-page-digest.ts`) garde ses titres dans un tableau structuré et n'aplatit qu'à l'intérieur d'un bloc. Une seule occurrence, donc, et je l'ai cherchée avant de l'affirmer.

## Preuve

☐ live iPhone

