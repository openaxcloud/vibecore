import { memo, useCallback, useMemo, useState } from 'react';

import {
  domainesConnectes,
  formaterMontant,
  gabaritsDisponibles,
  tarifDuGabarit,
  etapeCourante,
  etapesDePublication,
  etatDePastille,
  invitePourReparerLaPublication,
  lignesDeJournal,
  publicationEnCours,
  resumeDesEchecs,
  revisionCourte,
  type CarteTarifaire,
  type Deploiement,
  type Etape,
} from './publication';
import {
  formatPublicationCopy as texte,
  getPublicationCopy,
  type PublicationCopy,
} from '~/lib/i18n/catalogs/publication';

/*
 * RP-PUBLISH-01…06 — le panneau « Publishing » de Replit, sur nos données.
 *
 * Captures d'Avi, 08/09 21:00-21:02 : titre et sous-titre, « Adjust settings »,
 * barre d'étapes segmentée (bleue en cours, rose en échec, grise en attente),
 * liste de contrôle, journaux en ligne repliables, bandeau « N builds failed »
 * avec « Fix with Agent » et son menu, « View all failed builds », état courant
 * avec pastille, domaines, partage, infrastructure, historique, et le bouton
 * « Republish » collant en bas.
 *
 * Ce que ce composant N'INVENTE PAS : les étapes de migration de base de
 * données que montre Replit (nous n'avons pas ce pipeline), une URL quand
 * aucune n'existe, ni une date quand l'API n'en donne pas. Le langage visuel
 * est repris ; les données restent les nôtres.
 */

export interface PublicationReplitProps {
  deployments: readonly Deploiement[];
  language?: string | null;
  carteTarifaire?: CarteTarifaire | null;
  onOuvrirLesSecrets?: () => void;
  onOuvrirLaBaseDeDonnees?: () => void;
  onAction?: (intent: 'cancel' | 'redeploy' | 'rollback', deploymentId: string) => void;
  onRepublier?: () => void;
  onAjusterLesReglages?: () => void;
  onAnnuler?: (deploymentId: string) => void;
  onReparerAvecAgent?: (invite: string, cible: 'conversation' | 'tache') => void;
  onAjouterUnDomaine?: () => void;
  ilYA: (date: string | undefined | null) => string;
}

function Icone({ etat }: { etat: Etape['etat'] }) {
  const classe =
    etat === 'fait'
      ? 'i-ph:check-bold'
      : etat === 'encours'
        ? 'i-svg-spinners:90-ring-with-bg'
        : etat === 'echec'
          ? 'i-ph:pause-bold'
          : 'i-ph:clock';

  return <span className={classe} aria-hidden />;
}

function Segment({ etape, libelle, nomme }: { etape: Etape; libelle: string; nomme: boolean }) {
  return (
    <li className="bolt-publication-segment" data-etat={etape.etat} data-nomme={nomme ? 'true' : undefined}>
      {nomme ? <span className="bolt-publication-segment-libelle">{libelle}</span> : null}
      <Icone etat={etape.etat} />
    </li>
  );
}

/* La barre segmentée : l'étape courante porte son nom, les autres une icône. */
function BarreDesEtapes({ etapes, copy }: { etapes: Etape[]; copy: PublicationCopy }) {
  const courante = etapeCourante(etapes);

  return (
    <ol className="bolt-publication-etapes" data-testid="publication-etapes">
      {etapes.map((etape) => (
        <Segment
          key={etape.id}
          etape={etape}
          nomme={etape.id === courante?.id}
          libelle={copy[`publication.step.${etape.id}` as const]}
        />
      ))}
    </ol>
  );
}

function Carte({ titre, action, children }: { titre: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bolt-publication-carte">
      <header className="bolt-publication-carte-entete">
        <h3>{titre}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

export const PublicationReplit = memo(
  ({
    deployments,
    language,
    carteTarifaire,
    onOuvrirLesSecrets,
    onOuvrirLaBaseDeDonnees,
    onAction,
    onRepublier,
    onAjusterLesReglages,
    onAnnuler,
    onReparerAvecAgent,
    onAjouterUnDomaine,
    ilYA,
  }: PublicationReplitProps) => {
    const copy = getPublicationCopy(language);
    const dernier = deployments[0];

    const etapes = useMemo(() => etapesDePublication(dernier), [dernier]);
    const journal = useMemo(() => lignesDeJournal(dernier), [dernier]);
    const echecs = useMemo(() => resumeDesEchecs(deployments), [deployments]);
    const domaines = useMemo(() => domainesConnectes(deployments), [deployments]);
    const gabarits = useMemo(() => gabaritsDisponibles(carteTarifaire), [carteTarifaire]);

    const enCours = publicationEnCours(dernier);
    const pastille = etatDePastille(dernier);

    const [journauxOuverts, setJournauxOuverts] = useState(false);
    const [echecsOuverts, setEchecsOuverts] = useState(false);
    const [menuReparation, setMenuReparation] = useState(false);
    const [copie, setCopie] = useState<string | null>(null);
    const [reglages, setReglages] = useState(false);

    const reparer = useCallback(
      (cible: 'conversation' | 'tache') => {
        setMenuReparation(false);
        onReparerAvecAgent?.(
          invitePourReparerLaPublication({
            nombreDEchecs: echecs?.nombre ?? 1,
            provider: dernier?.provider ?? undefined,
            environment: dernier?.environment ?? undefined,
            journal,
          }),
          cible,
        );
      },
      [dernier, echecs, journal, onReparerAvecAgent],
    );

    const copier = useCallback(async (adresse: string) => {
      try {
        await navigator.clipboard.writeText(adresse);
        setCopie(adresse);
        setTimeout(() => setCopie(null), 2000);
      } catch {
        // Le presse-papiers peut être refusé ; on ne prétend pas avoir copié.
      }
    }, []);

    return (
      <div className="bolt-publication" data-testid="publication">
        <header className="bolt-publication-entete">
          <h2>{copy['publication.title']}</h2>
          <p>{copy['publication.subtitle']}</p>
          <button
            type="button"
            className="bolt-publication-reglages"
            data-testid="publication-reglages"
            aria-expanded={reglages}
            onClick={() => {
              setReglages((ouvert) => !ouvert);
              onAjusterLesReglages?.();
            }}
          >
            {reglages ? (
              <>
                <span className="i-ph:arrow-left" aria-hidden />
                {copy['publication.settings.cancel']}
              </>
            ) : (
              copy['publication.adjustSettings']
            )}
          </button>
        </header>

        {/*
         * RP-PUBLISH-07…12 — l'écran « Ajuster les réglages ».
         *
         * On reprend la disposition de Replit — rangées à résumé aligné à
         * droite, conséquence écrite sous chaque action — mais AUCUN
         * interrupteur décoratif : les modules suggérés de Replit (notifications
         * de disponibilité, statistiques, widget de retour, badge de parrainage)
         * ne commandent rien chez nous, et un interrupteur qui ne commande rien
         * fait mentir le produit. Ils reviendront le jour où le réglage existe.
         */}
        {reglages ? (
          <div className="bolt-publication-reglages-corps" data-testid="publication-reglages-corps">
            <Carte
              titre={copy['publication.settings.secrets']}
              action={
                onOuvrirLesSecrets ? (
                  <button type="button" onClick={onOuvrirLesSecrets}>
                    {copy['publication.settings.secretsOpen']}
                  </button>
                ) : undefined
              }
            >
              <p className="bolt-publication-vide">{copy['publication.settings.secretsDetail']}</p>
            </Carte>

            <Carte titre={copy['publication.settings.resources']}>
              <p className="bolt-publication-vide">{copy['publication.settings.resourcesDetail']}</p>
              <p className="bolt-publication-quand">{dernier?.machineSize ?? copy['publication.unknownScaling']}</p>
            </Carte>

            {/* RP-PUBLISH-10 — le prix vient de la carte tarifaire ACTIVE, jamais de la capture. */}
            <Carte titre={copy['publication.settings.machine']}>
              <p className="bolt-publication-vide">{copy['publication.settings.machineDetail']}</p>
              <ul className="bolt-publication-gabarits" data-testid="publication-gabarits">
                {gabarits.map((gabarit) => {
                  const tarif = tarifDuGabarit(carteTarifaire, gabarit.key);
                  const courant = gabarit.key === (dernier?.machineSize ?? carteTarifaire?.defaultMachineSize);

                  return (
                    <li key={gabarit.key} data-courant={courant ? 'true' : undefined}>
                      <div>
                        <strong>{gabarit.label}</strong>
                        {courant ? <em>{copy['publication.settings.current']}</em> : null}
                      </div>
                      <span>
                        {tarif
                          ? `${texte(copy['publication.settings.perMonthContinuous'], {
                              amount: formaterMontant(tarif.centsParMois, language),
                            })} · ${texte(copy['publication.settings.perHour'], {
                              amount: formaterMontant(tarif.centsParHeure, language, 4),
                            })}`
                          : copy['publication.settings.noPrice']}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="bolt-publication-vide">{copy['publication.settings.changeMachine']}</p>
            </Carte>

            <Carte
              titre={copy['publication.settings.database']}
              action={
                onOuvrirLaBaseDeDonnees ? (
                  <button type="button" onClick={onOuvrirLaBaseDeDonnees}>
                    {copy['publication.settings.databaseOpen']}
                  </button>
                ) : undefined
              }
            >
              <p className="bolt-publication-vide">{copy['publication.settings.databaseDetail']}</p>
            </Carte>

            {/* Chaque action porte SA conséquence sous elle, comme sur la capture. */}
            <Carte titre={copy['publication.settings.manage']}>
              <ul className="bolt-publication-gestes" data-testid="publication-gestes">
                {enCours && dernier?.id ? (
                  <li>
                    <button type="button" onClick={() => onAction?.('cancel', dernier.id!)}>
                      <span className="i-ph:pause" aria-hidden />
                      {copy['publication.settings.cancelDeploy']}
                    </button>
                    <p>{copy['publication.settings.cancelDeployDetail']}</p>
                  </li>
                ) : null}
                {dernier?.id ? (
                  <li>
                    <button type="button" onClick={() => onAction?.('redeploy', dernier.id!)}>
                      <span className="i-ph:rocket-launch" aria-hidden />
                      {copy['publication.settings.redeploy']}
                    </button>
                    <p>{copy['publication.settings.redeployDetail']}</p>
                  </li>
                ) : null}
                {dernier?.id && deployments.some((d) => d.status === 'READY') ? (
                  <li>
                    <button type="button" onClick={() => onAction?.('rollback', dernier.id!)}>
                      <span className="i-ph:arrow-counter-clockwise" aria-hidden />
                      {copy['publication.settings.rollback']}
                    </button>
                    <p>{copy['publication.settings.rollbackDetail']}</p>
                  </li>
                ) : null}
              </ul>
            </Carte>
          </div>
        ) : (
          <>
            {/* La carte de publication : étapes, et journaux en ligne. */}
            {dernier ? (
              <section className="bolt-publication-carte bolt-publication-encours" data-testid="publication-encours">
                <header className="bolt-publication-carte-entete">
                  <h3>{copy['publication.publishing']}</h3>
                  {dernier.startedAt ? (
                    <span className="bolt-publication-depuis">
                      {texte(copy['publication.startedAgo'], { ago: ilYA(dernier.startedAt) })}
                    </span>
                  ) : null}
                  <div className="bolt-publication-carte-actions">
                    {enCours && dernier.id && onAnnuler ? (
                      <button type="button" onClick={() => onAnnuler(dernier.id!)}>
                        {copy['publication.cancel']}
                      </button>
                    ) : null}
                    {journal.length > 0 ? (
                      <button
                        type="button"
                        aria-expanded={journauxOuverts}
                        data-testid="publication-bascule-journaux"
                        onClick={() => setJournauxOuverts((ouvert) => !ouvert)}
                      >
                        {journauxOuverts ? copy['publication.hideLogs'] : copy['publication.showLogs']}
                        <span className={journauxOuverts ? 'i-ph:caret-up' : 'i-ph:caret-down'} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </header>

                <BarreDesEtapes etapes={etapes} copy={copy} />

                {journauxOuverts && journal.length > 0 ? (
                  <pre className="bolt-publication-journal" data-testid="publication-journal">
                    {journal.join('\n')}
                  </pre>
                ) : null}
              </section>
            ) : null}

            {/* Le bandeau d'échec, et « Réparer avec l'agent ». */}
            {echecs ? (
              <section className="bolt-publication-echec" role="alert" data-testid="publication-echec">
                <span className="bolt-publication-echec-icone i-ph:warning" aria-hidden />
                <div className="bolt-publication-echec-texte">
                  <strong>
                    {texte(echecs.nombre > 1 ? copy['publication.buildsFailed'] : copy['publication.buildFailed'], {
                      count: echecs.nombre,
                    })}
                  </strong>
                  <p>{copy['publication.buildsFailedHelp']}</p>
                </div>
                <div className="bolt-publication-echec-actions">
                  <div className="bolt-publication-reparer">
                    <button type="button" data-testid="publication-reparer" onClick={() => reparer('conversation')}>
                      <span className="i-ph:sparkle" aria-hidden />
                      {copy['publication.fixWithAgent']}
                    </button>
                    <button
                      type="button"
                      aria-label={copy['publication.fixOptions']}
                      aria-expanded={menuReparation}
                      data-testid="publication-reparer-menu"
                      onClick={() => setMenuReparation((ouvert) => !ouvert)}
                    >
                      <span className="i-ph:caret-down" aria-hidden />
                    </button>
                    {menuReparation ? (
                      <ul className="bolt-publication-reparer-menu" data-testid="publication-reparer-options">
                        <li>
                          <button type="button" onClick={() => reparer('conversation')}>
                            <span className="i-ph:chat" aria-hidden />
                            {copy['publication.fixInCurrentChat']}
                          </button>
                        </li>
                        <li>
                          <button type="button" onClick={() => reparer('tache')}>
                            <span className="i-ph:plus" aria-hidden />
                            {copy['publication.fixInNewTask']}
                          </button>
                        </li>
                      </ul>
                    ) : null}
                  </div>
                  {journal.length > 0 ? (
                    <button type="button" onClick={() => setJournauxOuverts(true)}>
                      {copy['publication.viewLogs']}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* L'historique des échecs, replié. */}
            {echecs ? (
              <div className="bolt-publication-echecs-liste">
                <button
                  type="button"
                  aria-expanded={echecsOuverts}
                  data-testid="publication-bascule-echecs"
                  onClick={() => setEchecsOuverts((ouvert) => !ouvert)}
                >
                  <span className="i-ph:arrows-down-up" aria-hidden />
                  {copy['publication.viewAllFailedBuilds']}
                  {echecs.dernierA ? (
                    <span className="bolt-publication-fraicheur">
                      {texte(copy['publication.mostRecent'], { ago: ilYA(echecs.dernierA) })}
                    </span>
                  ) : null}
                  <span className={echecsOuverts ? 'i-ph:caret-up' : 'i-ph:caret-down'} aria-hidden />
                </button>
                {echecsOuverts ? (
                  <ul data-testid="publication-echecs-details">
                    {echecs.echecs.map((echec, index) => (
                      <li key={echec.id ?? index}>
                        <code>{revisionCourte(echec) ?? echec.id?.slice(0, 9) ?? '—'}</code>
                        <span>
                          {texte(copy['publication.failedAgo'], { ago: ilYA(echec.completedAt ?? echec.updatedAt) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {domaines[0] ? (
              <a className="bolt-publication-voir" href={domaines[0]} target="_blank" rel="noreferrer noopener">
                {copy['publication.viewApp']}
                <span className="i-ph:arrow-square-out" aria-hidden />
              </a>
            ) : null}

            <Carte
              titre={copy['publication.currentStatus']}
              action={
                <span className="bolt-publication-pastille" data-etat={pastille} data-testid="publication-pastille">
                  {copy[`publication.status.${pastille}` as const]}
                </span>
              }
            >
              {dernier ? (
                <p className="bolt-publication-quand">
                  {texte(
                    dernier.status === 'FAILED' ? copy['publication.failedAgo'] : copy['publication.publishedAgo'],
                    {
                      ago: ilYA(dernier.completedAt ?? dernier.updatedAt ?? dernier.createdAt),
                    },
                  )}
                </p>
              ) : (
                <p className="bolt-publication-quand">{copy['publication.noHistory']}</p>
              )}
            </Carte>

            <Carte
              titre={copy['publication.connectedDomains']}
              action={
                onAjouterUnDomaine ? (
                  <button type="button" onClick={onAjouterUnDomaine}>
                    {copy['publication.addDomain']}
                  </button>
                ) : undefined
              }
            >
              {domaines.length > 0 ? (
                <ul className="bolt-publication-domaines" data-testid="publication-domaines">
                  {domaines.map((domaine) => (
                    <li key={domaine}>
                      <span>{domaine}</span>
                      <button
                        type="button"
                        aria-label={copy['publication.copyDomain']}
                        onClick={() => void copier(domaine)}
                      >
                        <span className={copie === domaine ? 'i-ph:check' : 'i-ph:copy'} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="bolt-publication-vide">{copy['publication.noDomain']}</p>
              )}
            </Carte>

            <Carte titre={copy['publication.sharing']}>
              <div className="bolt-publication-partage">
                <span className="i-ph:globe" aria-hidden />
                <div>
                  <strong>{copy['publication.sharingPublic']}</strong>
                  <p>{copy['publication.sharingPublicDetail']}</p>
                </div>
              </div>
            </Carte>

            <Carte titre={copy['publication.infrastructure']}>
              <dl className="bolt-publication-infra" data-testid="publication-infra">
                <div>
                  <dt>{copy['publication.provider']}</dt>
                  <dd>{dernier?.provider ?? '—'}</dd>
                </div>
                <div>
                  <dt>{copy['publication.environment']}</dt>
                  <dd>{dernier?.environment ?? '—'}</dd>
                </div>
                <div>
                  <dt>{copy['publication.scaling']}</dt>
                  <dd>{dernier?.machineSize ?? copy['publication.unknownScaling']}</dd>
                </div>
              </dl>
            </Carte>

            <Carte titre={copy['publication.publishHistory']}>
              {deployments.length > 0 ? (
                <ul className="bolt-publication-historique" data-testid="publication-historique">
                  {deployments.slice(0, 10).map((deploiement, index) => (
                    <li key={deploiement.id ?? index}>
                      <code>{revisionCourte(deploiement) ?? deploiement.id?.slice(0, 9) ?? '—'}</code>
                      <span>
                        {texte(
                          deploiement.status === 'FAILED'
                            ? copy['publication.failedAgo']
                            : copy['publication.publishedAgo'],
                          { ago: ilYA(deploiement.completedAt ?? deploiement.updatedAt ?? deploiement.createdAt) },
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="bolt-publication-vide">{copy['publication.noHistory']}</p>
              )}
            </Carte>
          </>
        )}

        <div className="bolt-publication-pied">
          <button
            type="button"
            className="bolt-publication-republier"
            data-testid="publication-republier"
            disabled={enCours}
            onClick={onRepublier}
          >
            <span className="i-ph:rocket-launch" aria-hidden />
            {deployments.length > 0 ? copy['publication.republish'] : copy['publication.publish']}
          </button>
        </div>
      </div>
    );
  },
);
