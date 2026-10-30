# Palette1440 focus — diagnostic indépendant, 30 octobre 2026

Sources/build baseline856bd5e exacts, Chromium local21999. Aucun produit/build/serveur modifié. Scripts externes seulement ; données synthétiques, mutations/réseau extérieur bloqués.

## Parcours CI ordinaire

`probe.cjs` reprend mémoireIDE retenue, palette ouverteDatabase, remplacementcoque attendu, focussearch, CtrlShiftPvide, Escape puis focusAlltools. Deuxpassages1440 réussis : normal etCPU×4. Le ledger confirme le focusinput àchaquemontage puisfocusbuttonAlltools aprèsEscape. Donc l’échecCI1440 n’est pas reproduit ici.

## Course distincte déterministe

`close-remount.spec.tsx` importe le vraiuseCommandPaletteReturnFocus. Contrôle sansremountvert, fermer puisremplacermêmecoquedumêmeprojetavantRAFrouge. La refpartagée est consommée avantRAF ; cleanup annule ceRAF ; nouvellecoque fermée voitnull.

`close-before-remount.cjs` reproduit cette ordonnance dans le vrai build : retenirRAF aprèsEscape, libérerGETmémoire, attendreancienboutondétaché puislibérerframes. AssertionfocusAlltools échoue5s, activeElementBODY, ledgeraucunappelretourfocus. Ce script change explicitement l’ordre parrapportauCI (leCI attendpremierremplacement AVANTEscape). Il démontre un défautlocal mais PAS la cause exacte du retryCI.

## Portée et proposition

Périmètre indépendant : IdePaletteState.tsx/useCommandPaletteReturnFocus ettestsassociés. La restaurationdoit survivreuniquementauremplacementd’une coque danslemêmeproviderprojet/fenêtre ; continuerannulation surchangementprojet, fermetureclicextérieur, nouvelleintentionfocus etréouverture. Piste minimaleàrevoir : neconsommer sharedreturnFocusRef qu’aumomentduRAF plutôtqu’avant, afinque nouveaupropriétaire puisse reprendrelefocusannulé, toutenvidantimmédiatementlorsclicextérieur. Ne pas retirerlesgardes existantesd’annulation.

Pas de dépendance directeàclientHydrated : cehookagit aussi desktop1440. Lesmenumobile390/tablette820absentsaprèsEnter ont un autrechemin visibilité/useMobileIde/clientHydrated ; aucunecausecommuneétablie.

## Limites

Lesdeuxpremiersessaisnormal/cpu4 avantREADY ont échoué connexionrefusée ; ils necomptentpas commeproduit. Aucun correctif appliqué. CauseexacteCI nécessiteledgeroutrace montrant éventuelremountsupplémentaire aprèsEscape ouautrevolefocus ; aucune trace834consultée. Tousnavigateursdiagnosticfermés, serveurrootpréservé.

## Correction source autorisée, sans commit

IdePaletteState.tsx +.spec.tsx seulement. La ref restepartagée jusqu’auRAF effectif ; unmontageannulé n’effacepaslereçu ; cleanupannuleRAF etpositionnecancelled. Le RAF refuseunerefremplacée/nouvelleintention, respecteunélémentextérieuractif etrefuseplusieursremplaçantsvisiblesambigus. Outsideclickclearresteimmédiat. Leproviderprojet/fenêtreinchangé borneletransfert.

Tests dépôt :4rouges/25verts avantcorrectif ;29/29verts après. NouveauxtestsremountferméavantRAF, autreproviderref, nouvelleintention, cibleextérieureavec/sansremount, deuxcandidatsvisibles ; gardesreopen/outside/unmountpréservées. Lint2fichiersvert, diffcheckvert. Build/recettecompiléeàfaireparroot. AucuneBaseChatmodifiéeparcetagent, aucuncommit/publication.

## Recette compilée groupée finale

Serveurroot ui856-menu-fixed21999, buildgroupé. 7/7 passages directs réussis, aucune relance/retry :
- close-before-remount identique3fois (3contextes indépendants) : ancienboutondétaché, RAFretenu puislibéré, focusAlltoolsrestauré.
- Parcours ordreCI normal CPU1 puisCPU4 : rechercheconservée, Escape rendfocusAlltools.
- OutsideavantRAF : focuscomposerextérieurpréservé.
- RéouvertureavantRAF : focussearchpréservé.

Chaque script s’arrête aucontinue aprèsassertionciblée. Le codeDatabase/navigation/projetsituéaprèscecontinue n’estPASexécuté etneconstitueaucunecouverture. Lesoutside/reopenontleurspropresrecettesréellementexécutées. Lescapturesclose sontavantfermeture ; preuveaprèsfermeture=assertions+ledgerfocus, pascaptureaprèsrevendiquée. Demandedecaptureaprèstestarrivéeaprèstroisexécutions ; pasréexécutioninutile.

compiled-summary.json et septreceipt.json listent résultats/ledger. ZéroerreurJS. Tousnavigateursfermés normalement ; aucunserveur/build/source modifié parrecette. Toujoursdonnéessynthétiques etlocalChromium, pasvalidationproduction ni causeCI1440établie.
