import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cibleFeuilleMobile } from './feuille-mobile';
import { describeSkipReason, parseDotEnv } from './parse-dot-env';
import {
  cleValide,
  entreesDepuisJson,
  filtrerLesSecrets,
  garderLesValeursRenseignees,
  peutAjouter,
  placerSousLeBouton,
  texteEnvDepuisCles,
  texteJsonDepuisCles,
  type EntreeSecret,
} from './secrets-panel';
import { PanelEmptyState } from '~/components/project-ide/PanelPrimitives';
import { rechercheDemandee } from '~/components/workbench/recherche-demandee';
import { formatSecretsPanelCopy, getSecretsPanelCopy } from '~/lib/i18n/catalogs/secrets-panel';
import { revelerUnSecret } from '~/lib/reveler-un-secret';
import { classNames } from '~/utils/classNames';

/*
 * Onglet Secrets — parité pixel avec Replit sur téléphone (RP-SEC-01 à 08,
 * captures d'Avi du 07/09, 14:19–14:20) :
 *
 *   - en-tête sur une ligne : titre, menu ⋮ (Docs / Modifier en JSON /
 *     Modifier en .env), bouton « + Nouveau secret » ;
 *   - filtre par nom, pleine largeur, loupe à droite ;
 *   - ajout EN LIGNE : « Clé » / « Valeur (œil) » sur une rangée, « Annuler »
 *     / « Ajouter le secret » (grisé tant qu'il manque une clé valide ou une
 *     valeur) ;
 *   - une ligne par secret : puce clé (copier), puce valeur (copier, points,
 *     œil), bouton ⋮ → Modifier / Trouver les usages / Supprimer.
 *
 * Ce qui n'est PAS ici, faute de modèle côté API : les secrets de compte à
 * lier (RP-SEC-05/06) et les configurations avec valeur de test
 * (RP-SEC-07). Rien n'est simulé : ni icône de lien, ni section vide.
 *
 * Les valeurs ne sont jamais listées : elles se révèlent une par une, à la
 * demande, par la route existante (`reveal=true&confirm=1`).
 */

interface SecretDuProjet {
  key: string;
  updatedAt?: string | null;
}

interface ProjectSecretsPanelProps {
  projectId?: string;
  data: { secrets?: SecretDuProjet[] } | null | undefined;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  busy: boolean;
  reload?: () => void | Promise<void>;
  language: string;
}

type Editeur = 'env' | 'json' | null;

export function ProjectSecretsPanel({ projectId, data, onSubmit, busy, reload, language }: ProjectSecretsPanelProps) {
  const { t } = useTranslation();
  const copy = getSecretsPanelCopy(language);
  const secrets = useMemo(() => data?.secrets ?? [], [data]);
  const cles = useMemo(() => secrets.map((secret) => secret.key), [secrets]);

  const [filtre, setFiltre] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  // Le formulaire en ligne : fermé, ou ouvert en ajout (clé vide) / en modification.
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [cleEnEdition, setCleEnEdition] = useState<string | null>(null);
  const [cle, setCle] = useState('');
  const [valeur, setValeur] = useState('');
  const [valeurVisible, setValeurVisible] = useState(false);
  const champCleRef = useRef<HTMLInputElement>(null);
  const champValeurRef = useRef<HTMLInputElement>(null);

  const [menuEntete, setMenuEntete] = useState(false);
  const [menuLigne, setMenuLigne] = useState<string | null>(null);
  const [editeur, setEditeur] = useState<Editeur>(null);
  const [texteEditeur, setTexteEditeur] = useState('');
  const [application, setApplication] = useState<{ done: number; total: number } | null>(null);
  const [erreursEditeur, setErreursEditeur] = useState<string[]>([]);

  const boutonEnteteRef = useRef<HTMLButtonElement>(null);
  const boutonsLigneRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const formulairesSuppressionRef = useRef<Record<string, HTMLFormElement | null>>({});

  const visibles = useMemo(() => filtrerLesSecrets(secrets, filtre), [secrets, filtre]);

  useEffect(() => {
    if (formulaireOuvert) {
      (cleEnEdition ? champValeurRef : champCleRef).current?.focus();
    }
  }, [formulaireOuvert, cleEnEdition]);

  function ouvrirLeFormulaire(cleAModifier: string | null) {
    setCleEnEdition(cleAModifier);
    setCle(cleAModifier ?? '');
    setValeur('');
    setValeurVisible(false);
    setFormulaireOuvert(true);
    setMenuLigne(null);
  }

  function fermerLeFormulaire() {
    setFormulaireOuvert(false);
    setCleEnEdition(null);
    setCle('');
    setValeur('');
  }

  async function soumettre(event: React.FormEvent<HTMLFormElement>) {
    if (!peutAjouter(cle, valeur)) {
      event.preventDefault();
      return;
    }

    await onSubmit(event);
    fermerLeFormulaire();
  }

  async function lireLaValeur(key: string): Promise<string | undefined> {
    return revelerUnSecret(projectId, key);
  }

  async function basculerLaRevelation(key: string) {
    if (revealed[key] !== undefined) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[key];

        return next;
      });

      return;
    }

    const value = await lireLaValeur(key);

    if (typeof value === 'string') {
      setRevealed((current) => ({ ...current, [key]: value }));
      setMessage(t('baseChatAst.secrets.revealed', { key }));
    } else {
      setMessage(t('baseChatAst.secrets.revealFailed', { key }));
    }
  }

  async function copier(texte: string, succes: string, key: string) {
    try {
      await navigator.clipboard?.writeText(texte);
      setMessage(succes);
    } catch (error) {
      console.error('Secret copy failed', { key, error });
      setMessage(t('baseChatAst.secrets.copyFailed', { key }));
    }
  }

  async function copierLaCle(key: string) {
    await copier(key, t('baseChatAst.secrets.copied', { label: t('baseChatAst.secrets.secretKey') }), key);
  }

  async function copierLaValeur(key: string) {
    const value = revealed[key] ?? (await lireLaValeur(key));

    if (typeof value !== 'string') {
      setMessage(t('baseChatAst.secrets.revealFailed', { key }));
      return;
    }

    await copier(value, t('baseChatAst.secrets.valueCopied', { key }), key);
  }

  function trouverLesUsages(key: string) {
    setMenuLigne(null);
    rechercheDemandee.set(key);
    window.dispatchEvent(
      new CustomEvent('vibecore:open-project-ide-panel', { detail: { panel: 'search', toolId: 'search' } }),
    );
  }

  function supprimer(key: string) {
    setMenuLigne(null);
    formulairesSuppressionRef.current[key]?.requestSubmit();
  }

  function ouvrirLEditeur(type: Exclude<Editeur, null>) {
    setMenuEntete(false);
    setErreursEditeur([]);
    setTexteEditeur(type === 'env' ? texteEnvDepuisCles(cles) : texteJsonDepuisCles(cles));
    setEditeur(type);
  }

  /*
   * Application d'un éditeur : chaque ligne renseignée est un upsert par la
   * route existante, en séquence, avec le décompte à l'écran ; les échecs
   * sont nommés et l'éditeur reste ouvert pour réessayer.
   */
  async function appliquerLEditeur() {
    if (!projectId || !editeur) {
      return;
    }

    let entries: EntreeSecret[] = [];

    const erreurs: string[] = [];

    if (editeur === 'json') {
      const lecture = entreesDepuisJson(texteEditeur);

      if (lecture.erreur === 'json-invalide') {
        setErreursEditeur([copy['secretsPanel.editor.invalidJson']]);
        return;
      }

      if (lecture.erreur) {
        setErreursEditeur([copy['secretsPanel.editor.notAnObject']]);
        return;
      }

      if (lecture.clesInvalides.length) {
        erreurs.push(
          formatSecretsPanelCopy(copy['secretsPanel.editor.invalidKeys'], { keys: lecture.clesInvalides.join(', ') }),
        );
      }

      entries = lecture.entries;
    } else {
      const lecture = parseDotEnv(texteEditeur);

      if (lecture.skipped.length) {
        erreurs.push(
          `${formatSecretsPanelCopy(copy['secretsPanel.editor.skipped'], { count: lecture.skipped.length })} — ${lecture.skipped
            .map((ligne) => `${ligne.line} (${describeSkipReason(ligne.reason, language)})`)
            .join(', ')}`,
        );
      }

      entries = garderLesValeursRenseignees(lecture.entries);
    }

    if (!entries.length) {
      setErreursEditeur([...erreurs, copy['secretsPanel.editor.nothing']]);
      return;
    }

    setApplication({ done: 0, total: entries.length });

    const echecs: string[] = [];

    try {
      for (const [index, entry] of entries.entries()) {
        const form = new FormData();
        form.append('intent', 'upsert');
        form.append('key', entry.key);
        form.append('value', entry.value);

        try {
          const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/secrets`, {
            method: 'POST',
            body: form,
          });

          if (!response.ok) {
            const result = (await response.json().catch(() => null)) as { error?: unknown } | null;
            echecs.push(`${entry.key}: ${String(result?.error ?? `HTTP ${response.status}`)}`);
          }
        } catch (error) {
          console.error('Secret import request failed', { key: entry.key, error });
          echecs.push(`${entry.key}: ${t('baseChatAst.secrets.networkError')}`);
        }

        setApplication({ done: index + 1, total: entries.length });
      }

      const ok = entries.length - echecs.length;

      if (echecs.length) {
        setErreursEditeur([...erreurs, ...echecs]);
        setMessage(
          t('baseChatAst.secrets.importPartial', { count: entries.length, imported: ok, failed: echecs.length }),
        );
      } else {
        setMessage(t('baseChatAst.secrets.importComplete', { count: entries.length, imported: ok }));
        setEditeur(null);
      }

      await reload?.();
    } finally {
      setApplication(null);
    }
  }

  const ajoutPossible = peutAjouter(cle, valeur) && !busy;
  const cleInvalide = cle.length > 0 && !cleValide(cle);
  const idFiltre = useId();

  return (
    <div className="bolt-secrets" data-testid="secrets-panel">
      <header className="bolt-secrets-header">
        <h2 className="bolt-secrets-title">{copy['secretsPanel.title']}</h2>
        <div className="bolt-secrets-header-actions">
          <button
            ref={boutonEnteteRef}
            type="button"
            className="bolt-secrets-icon-button"
            aria-label={copy['secretsPanel.menu.aria']}
            aria-haspopup="menu"
            aria-expanded={menuEntete}
            data-testid="secrets-menu"
            onClick={() => setMenuEntete((ouvert) => !ouvert)}
          >
            <span className="i-ph:dots-three-vertical-bold" aria-hidden />
          </button>
          <button
            type="button"
            className="bolt-secrets-new"
            data-testid="secrets-new"
            onClick={() => (formulaireOuvert && !cleEnEdition ? fermerLeFormulaire() : ouvrirLeFormulaire(null))}
          >
            <span className="i-ph:plus" aria-hidden />
            <span>{copy['secretsPanel.new']}</span>
          </button>
        </div>
      </header>

      {menuEntete ? (
        <MenuFlottant
          ancre={boutonEnteteRef.current}
          onFermer={() => setMenuEntete(false)}
          label={copy['secretsPanel.menu.aria']}
        >
          <a className="bolt-secrets-menu-item" role="menuitem" href="/docs" target="_blank" rel="noreferrer">
            <span className="i-ph:book-open" aria-hidden />
            <span>{copy['secretsPanel.menu.docs']}</span>
          </a>
          <button
            type="button"
            className="bolt-secrets-menu-item"
            role="menuitem"
            onClick={() => ouvrirLEditeur('json')}
          >
            <span className="i-ph:brackets-curly" aria-hidden />
            <span>{copy['secretsPanel.menu.editJson']}</span>
          </button>
          <button
            type="button"
            className="bolt-secrets-menu-item"
            role="menuitem"
            onClick={() => ouvrirLEditeur('env')}
          >
            <span className="i-ph:file" aria-hidden />
            <span>{copy['secretsPanel.menu.editEnv']}</span>
          </button>
        </MenuFlottant>
      ) : null}

      <div className="bolt-secrets-filter">
        <input
          id={idFiltre}
          type="search"
          value={filtre}
          placeholder={copy['secretsPanel.filter.placeholder']}
          aria-label={copy['secretsPanel.filter.aria']}
          data-testid="secrets-filter"
          autoComplete="off"
          onChange={(event) => setFiltre(event.target.value)}
        />
        <span className="i-ph:magnifying-glass" aria-hidden />
      </div>

      {formulaireOuvert ? (
        <form className="bolt-secrets-form" data-testid="secrets-form" onSubmit={(event) => void soumettre(event)}>
          <input name="intent" value="upsert" type="hidden" />
          <label className="bolt-secrets-field">
            <span>{copy['secretsPanel.form.key']}</span>
            <input
              ref={champCleRef}
              name="key"
              value={cle}
              readOnly={Boolean(cleEnEdition)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={cleInvalide || undefined}
              data-testid="secrets-form-key"
              onChange={(event) => setCle(event.target.value)}
            />
          </label>
          <label className="bolt-secrets-field bolt-secrets-field--value">
            <span>
              {copy['secretsPanel.form.value']}
              <button
                type="button"
                className="bolt-secrets-eye"
                aria-label={valeurVisible ? copy['secretsPanel.form.hideValue'] : copy['secretsPanel.form.showValue']}
                aria-pressed={valeurVisible}
                onClick={() => setValeurVisible((visible) => !visible)}
              >
                <span className={valeurVisible ? 'i-ph:eye-slash' : 'i-ph:eye'} aria-hidden />
              </button>
            </span>
            <input
              ref={champValeurRef}
              name="value"
              type={valeurVisible ? 'text' : 'password'}
              value={valeur}
              autoComplete="off"
              spellCheck={false}
              data-testid="secrets-form-value"
              onChange={(event) => setValeur(event.target.value)}
            />
          </label>
          {cleInvalide ? <p className="bolt-secrets-form-error">{copy['secretsPanel.form.invalidKey']}</p> : null}
          <div className="bolt-secrets-form-actions">
            <button type="button" className="bolt-secrets-cancel" onClick={fermerLeFormulaire}>
              {copy['secretsPanel.form.cancel']}
            </button>
            <button type="submit" className="bolt-secrets-add" disabled={!ajoutPossible} data-testid="secrets-form-add">
              {cleEnEdition ? copy['secretsPanel.form.update'] : copy['secretsPanel.form.add']}
            </button>
          </div>
        </form>
      ) : null}

      {message ? (
        <p className="bolt-secrets-message" role="status">
          {message}
        </p>
      ) : null}

      {secrets.length === 0 ? (
        <PanelEmptyState
          icon="i-ph:lock"
          title={copy['secretsPanel.empty.title']}
          description={copy['secretsPanel.empty.description']}
        />
      ) : visibles.length === 0 ? (
        <p className="bolt-secrets-message">
          {formatSecretsPanelCopy(copy['secretsPanel.noMatch'], { filter: filtre })}
        </p>
      ) : (
        <ul className="bolt-secrets-list" data-testid="secrets-list">
          {visibles.map((secret) => {
            const key = secret.key;
            const revele = revealed[key];

            return (
              <li key={key} className="bolt-secrets-row" data-testid={`secret-row-${key}`}>
                <button
                  type="button"
                  className="bolt-secrets-chip bolt-secrets-chip--key"
                  aria-label={formatSecretsPanelCopy(copy['secretsPanel.row.copyKey'], { key })}
                  onClick={() => void copierLaCle(key)}
                >
                  <span className="i-ph:copy" aria-hidden />
                  <span className="bolt-secrets-chip-text">{key}</span>
                </button>
                <div
                  className={classNames('bolt-secrets-chip bolt-secrets-chip--value', {
                    'is-revealed': revele !== undefined,
                  })}
                >
                  <button
                    type="button"
                    className="bolt-secrets-chip-copy"
                    aria-label={formatSecretsPanelCopy(copy['secretsPanel.row.copyValue'], { key })}
                    onClick={() => void copierLaValeur(key)}
                  >
                    <span className="i-ph:copy" aria-hidden />
                    <span className="bolt-secrets-chip-text">{revele ?? '••••••••'}</span>
                  </button>
                  <button
                    type="button"
                    className="bolt-secrets-eye"
                    aria-label={formatSecretsPanelCopy(
                      revele !== undefined ? copy['secretsPanel.row.hide'] : copy['secretsPanel.row.reveal'],
                      { key },
                    )}
                    aria-pressed={revele !== undefined}
                    onClick={() => void basculerLaRevelation(key)}
                  >
                    <span className={revele !== undefined ? 'i-ph:eye-slash' : 'i-ph:eye'} aria-hidden />
                  </button>
                </div>
                <button
                  ref={(element) => {
                    boutonsLigneRef.current[key] = element;
                  }}
                  type="button"
                  className="bolt-secrets-icon-button bolt-secrets-row-menu"
                  aria-label={formatSecretsPanelCopy(copy['secretsPanel.row.menu'], { key })}
                  aria-haspopup="menu"
                  aria-expanded={menuLigne === key}
                  data-testid={`secret-menu-${key}`}
                  onClick={() => setMenuLigne((courant) => (courant === key ? null : key))}
                >
                  <span className="i-ph:dots-three-vertical-bold" aria-hidden />
                </button>
                <form
                  ref={(element) => {
                    formulairesSuppressionRef.current[key] = element;
                  }}
                  className="bolt-secrets-hidden-form"
                  onSubmit={(event) => void onSubmit(event)}
                >
                  <input name="intent" value="delete" type="hidden" />
                  <input name="key" value={key} type="hidden" />
                </form>
                {menuLigne === key ? (
                  <MenuFlottant
                    ancre={boutonsLigneRef.current[key]}
                    onFermer={() => setMenuLigne(null)}
                    label={formatSecretsPanelCopy(copy['secretsPanel.row.menu'], { key })}
                  >
                    <button
                      type="button"
                      className="bolt-secrets-menu-item"
                      role="menuitem"
                      onClick={() => ouvrirLeFormulaire(key)}
                    >
                      <span className="i-ph:pencil-simple" aria-hidden />
                      <span>{copy['secretsPanel.row.edit']}</span>
                    </button>
                    <button
                      type="button"
                      className="bolt-secrets-menu-item"
                      role="menuitem"
                      onClick={() => trouverLesUsages(key)}
                    >
                      <span className="i-ph:magnifying-glass" aria-hidden />
                      <span>{copy['secretsPanel.row.findUsages']}</span>
                    </button>
                    <button
                      type="button"
                      className="bolt-secrets-menu-item bolt-secrets-menu-item--danger"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => supprimer(key)}
                    >
                      <span className="i-ph:trash" aria-hidden />
                      <span>{copy['secretsPanel.row.delete']}</span>
                    </button>
                  </MenuFlottant>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {editeur ? (
        <EditeurEnMasse
          titre={editeur === 'json' ? copy['secretsPanel.editor.jsonTitle'] : copy['secretsPanel.editor.envTitle']}
          aide={copy['secretsPanel.editor.help']}
          texte={texteEditeur}
          erreurs={erreursEditeur}
          application={application}
          libelles={{
            appliquer: copy['secretsPanel.editor.apply'],
            enCours: copy['secretsPanel.editor.applying'],
            fermer: copy['secretsPanel.editor.close'],
          }}
          onTexte={(texte) => {
            setTexteEditeur(texte);
            setErreursEditeur([]);
          }}
          onAppliquer={() => void appliquerLEditeur()}
          onFermer={() => setEditeur(null)}
        />
      ) : null}
    </div>
  );
}

/*
 * Un menu flottant sous son bouton, aligné à droite, rendu hors du panneau
 * (racine du gabarit mobile, sinon le corps) : le panneau défile et borne
 * ses descendants. Se ferme au toucher dehors, à Échap (en capture — le
 * gestionnaire de raccourcis du projet consomme la touche), au défilement.
 */
function MenuFlottant({
  ancre,
  onFermer,
  label,
  children,
}: {
  ancre: HTMLElement | null;
  onFermer: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;

    if (!menu || !ancre) {
      return;
    }

    const rect = ancre.getBoundingClientRect();
    const taille = menu.getBoundingClientRect();

    setPosition(
      placerSousLeBouton(
        rect,
        { largeur: taille.width, hauteur: taille.height },
        { largeur: window.innerWidth, hauteur: window.innerHeight },
      ),
    );
    (menu.querySelector<HTMLElement>('[role="menuitem"]') ?? menu).focus({ preventScroll: true });
  }, [ancre]);

  useEffect(() => {
    const surPointeur = (event: PointerEvent) => {
      const cible = event.target as Node;

      if (menuRef.current?.contains(cible) || ancre?.contains(cible)) {
        return;
      }

      onFermer();
    };
    const surClavier = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onFermer();
      }
    };

    document.addEventListener('pointerdown', surPointeur, true);
    window.addEventListener('keydown', surClavier, true);
    window.addEventListener('scroll', onFermer, true);
    window.addEventListener('resize', onFermer);

    return () => {
      document.removeEventListener('pointerdown', surPointeur, true);
      window.removeEventListener('keydown', surClavier, true);
      window.removeEventListener('scroll', onFermer, true);
      window.removeEventListener('resize', onFermer);
    };
  }, [ancre, onFermer]);

  const cible = typeof document === 'undefined' ? null : (cibleFeuilleMobile(document) ?? document.body);

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="bolt-secrets-menu"
      data-testid="secrets-floating-menu"
      style={position ? { left: position.x, top: position.y } : { left: -9999, top: -9999 }}
    >
      {children}
    </div>
  );

  return cible ? createPortal(menu, cible) : menu;
}

function EditeurEnMasse({
  titre,
  aide,
  texte,
  erreurs,
  application,
  libelles,
  onTexte,
  onAppliquer,
  onFermer,
}: {
  titre: string;
  aide: string;
  texte: string;
  erreurs: string[];
  application: { done: number; total: number } | null;
  libelles: { appliquer: string; enCours: string; fermer: string };
  onTexte: (texte: string) => void;
  onAppliquer: () => void;
  onFermer: () => void;
}) {
  const idTitre = useId();

  useEffect(() => {
    const surClavier = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onFermer();
      }
    };

    window.addEventListener('keydown', surClavier, true);

    return () => window.removeEventListener('keydown', surClavier, true);
  }, [onFermer]);

  const cible = typeof document === 'undefined' ? null : (cibleFeuilleMobile(document) ?? document.body);

  const feuille = (
    <div className="bolt-secrets-editor-veil" onClick={onFermer}>
      <div
        className="bolt-secrets-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        data-testid="secrets-editor"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bolt-secrets-editor-header">
          <h3 id={idTitre}>{titre}</h3>
          <button type="button" className="bolt-secrets-icon-button" aria-label={libelles.fermer} onClick={onFermer}>
            <span className="i-ph:x" aria-hidden />
          </button>
        </header>
        <p className="bolt-secrets-editor-help">{aide}</p>
        <textarea
          value={texte}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          data-testid="secrets-editor-text"
          onChange={(event) => onTexte(event.target.value)}
        />
        {erreurs.length ? (
          <ul className="bolt-secrets-editor-errors" role="alert">
            {erreurs.map((erreur) => (
              <li key={erreur}>{erreur}</li>
            ))}
          </ul>
        ) : null}
        <div className="bolt-secrets-form-actions">
          <button type="button" className="bolt-secrets-cancel" onClick={onFermer} disabled={Boolean(application)}>
            {libelles.fermer}
          </button>
          <button
            type="button"
            className="bolt-secrets-add"
            onClick={onAppliquer}
            disabled={Boolean(application)}
            data-testid="secrets-editor-apply"
          >
            {application
              ? formatSecretsPanelCopy(libelles.enCours, { done: application.done, total: application.total })
              : libelles.appliquer}
          </button>
        </div>
      </div>
    </div>
  );

  return cible ? createPortal(feuille, cible) : feuille;
}
