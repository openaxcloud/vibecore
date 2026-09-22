/*
 * La feuille des modes — les deux écrans, rendus.
 *
 * Toute la décision vit dans `feuille-des-modes.ts`, testé sans DOM. Ce fichier
 * ne fait que peindre : il n'invente aucun état, ne choisit aucun modèle et ne
 * décide d'aucun verrou. C'est délibéré — les décisions portent de l'argent, et
 * on ne les met pas dans du JSX où elles ne se testent qu'au rendu.
 *
 * Les textes sont NOS mots, pas ceux d'un concurrent : la disposition est
 * reprise, la rédaction est à nous.
 */
import type { AgentMode, CatalogueDuMode, CranEffort, SondeFournisseur } from '@vibecore/billing';
import { useState } from 'react';

import {
  entreesDuMode,
  etatDuCurseur,
  ligneDeMode,
  lignesDuSelecteur,
  resolutionDuChoix,
  type ChoixDuMode,
} from './feuille-des-modes';
import { formatChatControlsCopy, type ChatControlsCopy } from '~/lib/i18n/catalogs/chat-controls';
import { classNames } from '~/utils/classNames';

export interface FeuilleDesModesProps {
  copy: ChatControlsCopy;
  modes: AgentMode[];
  modeActif: AgentMode;
  libelleDuMode: (mode: AgentMode) => { label: string; hint: string };
  catalogues: CatalogueDuMode[];
  sondes: SondeFournisseur[];
  choixParMode: Partial<Record<AgentMode, ChoixDuMode>>;
  onChoisirMode: (mode: AgentMode) => void;
  onChoisirModele: (mode: AgentMode, choix: ChoixDuMode) => void;
}

type Niveau = { ecran: 'modes' } | { ecran: 'modele'; mode: AgentMode } | { ecran: 'avance'; mode: AgentMode };

/** Le logo du fournisseur. Un carré de couleur + initiale : aucune marque tierce embarquée. */
function Fournisseur({ nom }: { nom: string }) {
  return (
    <span className="bolt-feuille-fournisseur" data-fournisseur={nom} aria-hidden>
      {nom.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function FeuilleDesModes({
  copy,
  modes,
  modeActif,
  libelleDuMode,
  catalogues,
  sondes,
  choixParMode,
  onChoisirMode,
  onChoisirModele,
}: FeuilleDesModesProps) {
  const [niveau, setNiveau] = useState<Niveau>({ ecran: 'modes' });
  const catalogueDe = (mode: AgentMode) => catalogues.find((c) => c.mode === mode);

  if (niveau.ecran === 'modes') {
    const actif = libelleDuMode(modeActif);
    const entrees = entreesDuMode(modeActif);
    const resolution = resolutionDuChoix(catalogueDe(modeActif), sondes, choixParMode[modeActif]);

    return (
      <div className="bolt-feuille" data-ecran="modes">
        <p className="bolt-feuille-titre">{copy['chatControls.sheet.modesTitle']}</p>

        <div role="radiogroup" aria-label={copy['chatControls.power.groupAria']}>
          {modes.map((mode) => {
            const ligne = ligneDeMode(mode, modeActif, choixParMode[mode], catalogueDe(mode), sondes);
            const { label } = libelleDuMode(mode);

            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={ligne.selectionne}
                data-selected={ligne.selectionne ? 'true' : 'false'}
                data-testid={`feuille-mode-${mode}`}
                className="bolt-feuille-rangee"
                onClick={() => onChoisirMode(mode)}
              >
                <span className="bolt-feuille-rangee-nom">{label}</span>
                <span className="bolt-feuille-rangee-valeur">
                  {ligne.valeur.sorte === 'auto' ? copy['chatControls.sheet.auto'] : ligne.valeur.model}
                </span>
              </button>
            );
          })}
        </div>

        <p className="bolt-feuille-description">{actif.hint}</p>

        {resolution?.repliApplique ? (
          <p className="bolt-feuille-repli" data-testid="feuille-repli">
            {formatChatControlsCopy(copy['chatControls.sheet.fallbackNotice'], {
              asked: resolution.demande.model,
              served: resolution.servi!.model,
            })}
          </p>
        ) : null}

        {entrees.map((entree) => (
          <button
            key={entree.sorte}
            type="button"
            className="bolt-feuille-entree"
            data-testid={`feuille-entree-${entree.sorte}`}
            data-verrouillee={entree.verrouillee ? 'true' : 'false'}
            disabled={entree.verrouillee}
            onClick={() => setNiveau({ ecran: entree.sorte, mode: modeActif })}
          >
            <span className="bolt-feuille-entree-nom">
              {entree.sorte === 'modele'
                ? formatChatControlsCopy(copy['chatControls.sheet.primaryModel'], { mode: actif.label })
                : copy['chatControls.sheet.advanced']}
            </span>
            <span className="bolt-feuille-entree-hint">
              {entree.verrouillee
                ? copy['chatControls.sheet.lockedFromPower']
                : entree.sorte === 'modele'
                  ? copy['chatControls.sheet.primaryModelHint']
                  : copy['chatControls.sheet.advancedHint']}
            </span>
            <span
              className={classNames(
                'bolt-feuille-chevron',
                entree.verrouillee ? 'i-ph:lock-simple' : 'i-ph:caret-right',
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
    );
  }

  const mode = niveau.mode;
  const catalogue = catalogueDe(mode);
  const choix = choixParMode[mode];
  const { label } = libelleDuMode(mode);

  return (
    <div className="bolt-feuille" data-ecran={niveau.ecran}>
      <div className="bolt-feuille-entete">
        <button
          type="button"
          className="bolt-feuille-retour i-ph:caret-left"
          data-testid="feuille-retour"
          aria-label={copy['chatControls.sheet.modesTitle']}
          onClick={() => setNiveau({ ecran: 'modes' })}
        />
        <p className="bolt-feuille-titre">
          {niveau.ecran === 'modele'
            ? formatChatControlsCopy(copy['chatControls.sheet.primaryModel'], { mode: label })
            : copy['chatControls.sheet.advanced']}
        </p>
      </div>

      {niveau.ecran === 'modele' && catalogue
        ? lignesDuSelecteur(catalogue, sondes, choix).map((ligne) => {
            const indisponible = ligne.sorte === 'modele' && ligne.etat !== 'disponible';
            const cle = ligne.sorte === 'automatique' ? 'auto' : `${ligne.model}-${ligne.serviceTier ?? 'std'}`;

            return (
              <button
                key={cle}
                type="button"
                role="radio"
                aria-checked={ligne.choisie}
                data-selected={ligne.choisie ? 'true' : 'false'}
                data-etat={ligne.etat ?? 'auto'}
                data-testid={`feuille-modele-${cle}`}
                disabled={indisponible}
                className="bolt-feuille-rangee bolt-feuille-rangee-modele"
                onClick={() =>
                  onChoisirModele(
                    mode,
                    ligne.sorte === 'automatique'
                      ? {}
                      : { modele: ligne.model, serviceTier: ligne.serviceTier, effort: choix?.effort },
                  )
                }
              >
                {ligne.sorte === 'automatique' ? (
                  <>
                    <span className="bolt-feuille-rangee-nom">{copy['chatControls.sheet.chooseForMe']}</span>
                    <span className="bolt-feuille-pastille">{copy['chatControls.sheet.recommended']}</span>
                    <span className="bolt-feuille-rangee-hint">{copy['chatControls.sheet.chooseForMeHint']}</span>
                  </>
                ) : (
                  <>
                    <Fournisseur nom={ligne.provider!} />
                    <span className="bolt-feuille-rangee-nom">
                      {ligne.model}
                      {ligne.serviceTier === 'fast' ? copy['chatControls.sheet.fastSuffix'] : ''}
                    </span>
                    {indisponible ? (
                      <span className="bolt-feuille-indispo">
                        {copy['chatControls.sheet.unavailable']}
                        {' — '}
                        {ligne.raison === 'credit-fournisseur'
                          ? copy['chatControls.sheet.unavailableCredit']
                          : ligne.raison === 'cle-absente'
                            ? copy['chatControls.sheet.notConfigured']
                            : copy['chatControls.sheet.unavailableReach']}
                      </span>
                    ) : null}
                  </>
                )}
              </button>
            );
          })
        : null}

      <BlocEffort
        copy={copy}
        catalogue={catalogue}
        sondes={sondes}
        choix={choix}
        onChanger={(cran) => onChoisirModele(mode, { ...choix, effort: cran })}
      />
    </div>
  );
}

/** Le curseur d'effort : autant de crans que le modèle en déclare, pas un de plus. */
function BlocEffort({
  copy,
  catalogue,
  sondes,
  choix,
  onChanger,
}: {
  copy: ChatControlsCopy;
  catalogue: CatalogueDuMode | undefined;
  sondes: SondeFournisseur[];
  choix: ChoixDuMode | undefined;
  onChanger: (cran: CranEffort) => void;
}) {
  const etat = etatDuCurseur(catalogue, sondes, choix);

  if (!etat.actif) {
    return (
      <p className="bolt-feuille-effort-absent" data-testid="feuille-effort-absent">
        {copy['chatControls.sheet.effortUnsupported']}
      </p>
    );
  }

  const rang = etat.valeur ? etat.crans.indexOf(etat.valeur) : 0;

  const phrases = [
    copy['chatControls.sheet.effort1'],
    copy['chatControls.sheet.effort2'],
    copy['chatControls.sheet.effort3'],
    copy['chatControls.sheet.effort4'],
    copy['chatControls.sheet.effort5'],
  ];

  /*
   * La phrase suit la POSITION RELATIVE, pas le nom du cran : un modèle à quatre
   * crans doit lire « équilibre » au milieu de SON échelle, pas la phrase du
   * troisième cran d'une échelle à cinq qu'il ne possède pas.
   */
  const phrase = phrases[Math.round((rang / Math.max(1, etat.crans.length - 1)) * (phrases.length - 1))];

  return (
    <div className="bolt-feuille-effort" data-testid="feuille-effort" data-crans={etat.crans.length}>
      <div className="bolt-feuille-effort-tete">
        <span className="bolt-feuille-effort-nom">{copy['chatControls.sheet.effort']}</span>
        <span className="bolt-feuille-effort-valeur">{etat.valeur}</span>
      </div>

      <input
        type="range"
        min={0}
        max={etat.crans.length - 1}
        step={1}
        value={rang}
        aria-label={copy['chatControls.sheet.effort']}
        data-testid="feuille-effort-rail"
        onChange={(evenement) => onChanger(etat.crans[Number(evenement.target.value)])}
      />

      <div className="bolt-feuille-effort-bornes">
        <span>{copy['chatControls.sheet.effortLow']}</span>
        <span>{copy['chatControls.sheet.effortMax']}</span>
      </div>

      <p className="bolt-feuille-effort-phrase">{phrase}</p>
    </div>
  );
}
