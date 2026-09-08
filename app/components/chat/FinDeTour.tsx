import { useState } from 'react';
import {
  formaterLaDateDuPoint,
  lignesDuDetailDuTour,
  titreDeLaLignePoint,
  titreDeLaLigneTravail,
  type PointDeRestauration,
  type StatistiquesDuTour,
} from '~/components/chat/fin-de-tour';
import { getFinDeTourCopy } from '~/lib/i18n/catalogs/fin-de-tour';
import { classNames } from '~/utils/classNames';

/*
 * Fin de tour de l'agent — parité Replit (RP-CKPT-02, 03, 06, 07).
 *
 * Sous la réponse, deux lignes repliables, fermées par défaut, ouvertes au
 * toucher (un bouton, jamais un survol ni un effet de bord du focus) :
 *   « Worked for 2 minutes »        → Time worked / Work done / Items read / Agent usage
 *   « Checkpoint made 25 days ago » → message du commit, date, Rollback here, Changes
 *
 * Mesures prises sur les captures iPhone d'Avi du 08/09 (3,0 px par px CSS,
 * étalonné sur notre en-tête de 48 px) : ligne de 38 px, icône dans un carré
 * de 26 px à bord fin, titre 14 px, carte de détail à fond feutré, rangées
 * de 26 px à 13 px, boutons de 28 px à fond gris.
 */

export type FinDeTourProps = {
  messageId: string;
  statistiques: StatistiquesDuTour;
  point: PointDeRestauration | null;
  language?: string | null;
  onRollback?: (point: PointDeRestauration) => void;
  onChanges?: (point: PointDeRestauration) => void;
};

function Ligne({
  testid,
  icone,
  iconeClasse,
  titre,
  ouvert,
  basculer,
  copy,
  children,
}: {
  testid: string;
  icone: string;
  iconeClasse?: string;
  titre: string;
  ouvert: boolean;
  basculer: () => void;
  copy: ReturnType<typeof getFinDeTourCopy>;
  children: React.ReactNode;
}) {
  const detailId = `${testid}-detail`;

  return (
    <section className={classNames('bolt-fin-de-tour-ligne', { 'bolt-fin-de-tour-ligne-ouverte': ouvert })}>
      <button
        type="button"
        className="bolt-fin-de-tour-titre"
        aria-expanded={ouvert}
        aria-controls={detailId}
        data-testid={testid}
        onClick={basculer}
        title={ouvert ? copy['finDeTour.collapse'] : copy['finDeTour.expand']}
      >
        <span className={classNames('bolt-fin-de-tour-icone', iconeClasse)} aria-hidden>
          <span className={icone} />
        </span>
        <span className="bolt-fin-de-tour-libelle">{titre}</span>
        <span
          className={classNames('bolt-fin-de-tour-chevron', ouvert ? 'i-ph:caret-up' : 'i-ph:caret-down')}
          aria-hidden
        />
      </button>
      {ouvert ? (
        <div className="bolt-fin-de-tour-detail" id={detailId} data-testid={detailId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function FinDeTour({ messageId, statistiques, point, language, onRollback, onChanges }: FinDeTourProps) {
  const copy = getFinDeTourCopy(language);
  const [travailOuvert, setTravailOuvert] = useState(false);
  const [pointOuvert, setPointOuvert] = useState(false);

  const montrerLeTravail = typeof statistiques.dureeMs === 'number' || statistiques.actions > 0;

  return (
    <div className="bolt-fin-de-tour" data-testid={`fin-de-tour-${messageId}`}>
      {montrerLeTravail ? (
        <Ligne
          testid="fin-de-tour-travail"
          icone="i-ph:gauge"
          titre={titreDeLaLigneTravail(statistiques, language)}
          ouvert={travailOuvert}
          basculer={() => setTravailOuvert((courant) => !courant)}
          copy={copy}
        >
          <dl className="bolt-fin-de-tour-tableau">
            {lignesDuDetailDuTour(statistiques, language).map((ligne) => (
              <div className="bolt-fin-de-tour-rangee" key={ligne.cle} data-testid={`fin-de-tour-${ligne.cle}`}>
                <dt>{ligne.libelle}</dt>
                <dd>{ligne.valeur}</dd>
              </div>
            ))}
          </dl>
        </Ligne>
      ) : null}
      {point ? (
        <Ligne
          testid="fin-de-tour-point"
          icone="i-ph:check-circle"
          iconeClasse="bolt-fin-de-tour-icone-point"
          titre={titreDeLaLignePoint(point, language)}
          ouvert={pointOuvert}
          basculer={() => setPointOuvert((courant) => !courant)}
          copy={copy}
        >
          <p className="bolt-fin-de-tour-commit">{point.commitMessage || copy['finDeTour.unknown']}</p>
          <p className="bolt-fin-de-tour-date">{formaterLaDateDuPoint(point.createdAt, language)}</p>
          <div className="bolt-fin-de-tour-boutons">
            <button type="button" data-testid="fin-de-tour-rollback" onClick={() => onRollback?.(point)}>
              <span className="i-ph:clock-counter-clockwise" aria-hidden />
              {copy['finDeTour.rollback']}
            </button>
            {point.commitSha ? (
              <button type="button" data-testid="fin-de-tour-changes" onClick={() => onChanges?.(point)}>
                <span className="i-ph:code" aria-hidden />
                {copy['finDeTour.changes']}
              </button>
            ) : null}
          </div>
        </Ligne>
      ) : null}
    </div>
  );
}
