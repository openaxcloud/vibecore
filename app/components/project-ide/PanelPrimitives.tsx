import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react';

import { EmptyState, IDE_PRIMARY_ACCENT_CLASSES } from '~/components/ui/EmptyState';
import { classNames } from '~/utils/classNames';

/*
 * Primitives partagées des panneaux IDE (lot UNIF-IDE, lot 1).
 *
 * Historiquement `PanelButton` / `PanelInput` étaient des fonctions PRIVÉES de
 * BaseChat.tsx : impossibles à tester isolément, et dupliquées de fait par
 * chaque nouvelle surface. Elles vivent ici, exportées, avec deux correctifs
 * de fond :
 *
 * 1. `PanelButton` hardcodait `type="submit"` APRÈS le spread des props, donc
 *    un `type="button"` explicite était silencieusement écrasé. Concret : le
 *    bouton « Import .env » du panneau Secrets vit DANS le <form> de création
 *    de secret ; son clic soumettait aussi ce form et déclenchait les bulles
 *    de validation HTML sur les champs requis. Le `type` fourni gagne
 *    désormais ; le défaut reste `submit` (comportement historique : la
 *    majorité des PanelButton sont les CTA de leur form).
 * 2. Les deux primitives fusionnent maintenant `className` au lieu de
 *    l'ignorer, pour permettre les ajustements locaux sans re-fork.
 */

/*
 * UNIF lot 4 — LE style primary tranché (audit B2/K1). Deux styles de CTA
 * coexistaient dans les mêmes panneaux : la paire de tokens
 * `bg-bolt-elements-button-primary-*` (fond teinté + texte accent) et le plein
 * `--vc-ide-accent-action` + texte blanc du `ui/EmptyState` canonique. Le
 * standard IDE retenu est le SECOND ; la source unique est
 * `IDE_PRIMARY_ACCENT_CLASSES` (ui/EmptyState — importée ici pour éviter un
 * import circulaire). Les tokens `--bolt-elements-button-primary-*` restent
 * définis pour les surfaces legacy hors panneaux IDE (dialogs, marketing) —
 * c'est l'« alias » de transition.
 */
export interface PanelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * - `primary` (défaut) : CTA plein accent action (standard EmptyState).
   * - `outline` : action secondaire bordée.
   * - `danger` : action destructive/erreur bordée (Retry d'erreur, Delete).
   * - `menu` : item de menu déroulant (⋮ de la coque) — pleine largeur,
   *   aligné à gauche, hover discret ; ignore `size`.
   */
  variant?: 'primary' | 'outline' | 'danger' | 'menu';

  /** `md` (défaut) : h-9 / 14 px. `sm` : h-7 / 12 px (toolbars, bannières). */
  size?: 'md' | 'sm';
  children?: ReactNode;
}

const PANEL_BUTTON_VARIANT_CLASSES: Record<NonNullable<PanelButtonProps['variant']>, string> = {
  primary: IDE_PRIMARY_ACCENT_CLASSES,
  outline:
    'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
  danger:
    'border border-[var(--vc-ide-accent-error)]/50 text-[var(--vc-ide-accent-error)] transition-colors hover:bg-[var(--vc-ide-accent-error)]/10',
  menu: 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-bolt-elements-background-depth-3',
};

export function PanelButton({
  children,
  variant = 'primary',
  size = 'md',
  type,
  className,
  ...props
}: PanelButtonProps) {
  return (
    <button
      {...props}
      type={type ?? 'submit'}
      className={classNames(
        'disabled:cursor-not-allowed disabled:opacity-60',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
        variant === 'menu'
          ? PANEL_BUTTON_VARIANT_CLASSES.menu
          : /*
             * UNIF-14 : `gap-1.5` intégré au gabarit — les boutons icône+libellé
             * (Integrations, Workflows) tenaient leur espacement de règles SCSS
             * ad hoc désormais supprimées.
             */
            classNames(
              'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition',
              size === 'sm' ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm',
              PANEL_BUTTON_VARIANT_CLASSES[variant],
            ),
        className,
      )}
    >
      {children}
    </button>
  );
}

/* `size` natif (largeur en caractères) écarté au profit de la taille de gabarit. */
export interface PanelInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** `md` (défaut) : h-9 / 14 px. `sm` : h-7 / 12 px (filtres, toolbars). */
  size?: 'md' | 'sm';
}

export function PanelInput({ className, size = 'md', ...props }: PanelInputProps) {
  return (
    <input
      {...props}
      className={classNames(
        'min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 outline-none focus:border-bolt-elements-focus',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-9 px-2 text-sm',
        className,
      )}
    />
  );
}

export interface PanelSectionTitleProps {
  /**
   * `section` (défaut) : titre de section de panneau — 13 px / 600.
   * `group` : intertitre de groupe — 11 px / 600, capitales espacées.
   */
  level?: 'section' | 'group';
  className?: string;
  children: ReactNode;
}

/*
 * Titre de section normalisé des panneaux IDE (UNIF-08, audit H3).
 *
 * Avant : trois familles coexistaient dans BaseChat — `<h3 text-sm
 * font-semibold>`, `<h3 mb-2 text-sm font-medium>` (Agent Studio) et
 * `<h4 text-xs uppercase tracking-wide>` — donc trois hiérarchies visuelles
 * pour le même rôle. Deux niveaux fermés, sur l'échelle typo 11/12/13/14.
 */
export function PanelSectionTitle({ level = 'section', className, children }: PanelSectionTitleProps) {
  if (level === 'group') {
    return (
      <h4
        className={classNames(
          'text-[11px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary',
          className,
        )}
      >
        {children}
      </h4>
    );
  }

  return (
    <h3 className={classNames('text-[13px] font-semibold text-bolt-elements-textPrimary', className)}>{children}</h3>
  );
}

export interface IdePanelHeaderProps {
  /** Icône UnoCSS (`i-ph:*`) affichée avant le titre. */
  icon?: string;

  title: string;

  /**
   * Attributs additionnels du titre (ex. `tabIndex: -1` pour un panneau qui
   * déplace le focus sur sa tête à l'ouverture, comme Problems).
   */
  titleTabIndex?: number;

  /**
   * Slot méta + actions, rendu à droite (puce « Updated … », compteurs,
   * menu ⋮). Le conteneur est `position: relative` pour ancrer un menu.
   */
  children?: ReactNode;

  /** Ref du conteneur d'actions (fermeture au clic extérieur, ancrage menu). */
  actionsRef?: Ref<HTMLDivElement>;
  className?: string;
}

/**
 * En-tête de panneau IDE unique (UNIF-06, audit H1). Reprend la tête partagée
 * des panneaux « gestion » (`.bolt-project-ide-panel-header`, 36 px) et
 * l'expose aux panneaux workspace qui divergeaient (Problems) ou n'avaient
 * aucune tête (Search, Locks) : même icône + titre + slot méta/actions, mêmes
 * paddings et typo partout.
 */
export function IdePanelHeader({ icon, title, titleTabIndex, children, actionsRef, className }: IdePanelHeaderProps) {
  return (
    <div className={classNames('bolt-project-ide-panel-header', className)}>
      {icon ? <span className={icon} aria-hidden /> : null}
      <h2 className="m-0 min-w-0 truncate text-sm font-semibold" tabIndex={titleTabIndex}>
        {title}
      </h2>
      {children ? (
        <div className="relative ml-auto flex min-w-0 items-center gap-2" ref={actionsRef}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface PanelToolTabsProps<T extends string> {
  /** Paires [id, libellé] dans l'ordre d'affichage. */
  tabs: ReadonlyArray<readonly [T, string]>;
  active: T;
  onSelect: (id: T) => void;

  /**
   * Désactive TOUS les onglets (UNIF-14 : onglets de scope Env gelés pendant
   * la vue « Diff scopes »). La sélection courante reste affichée.
   */
  disabled?: boolean;
  className?: string;
}

/**
 * Barre d'onglets d'outil de panneau (UNIF lot 7). Trois panneaux (Object
 * Storage « Objects | Settings », Security, Deployments) dupliquaient le même
 * `map()` de `<button aria-current>` sous `.bolt-project-tool-tabs` ; le
 * markup vit désormais ici, la feuille `.bolt-project-tool-tabs` (desktop +
 * mobile 40px) reste la source unique du style. Sélection = `aria-current`,
 * comme les vrais onglets de navigation — PAS des PanelButton : un onglet
 * actif n'est pas un CTA.
 */
export function PanelToolTabs<T extends string>({
  tabs,
  active,
  onSelect,
  disabled,
  className,
}: PanelToolTabsProps<T>) {
  return (
    <div className={classNames('bolt-project-tool-tabs', className)}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-current={active === id ? 'page' : undefined}
          disabled={disabled}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export interface PanelEmptyStateProps {
  /** Phrase principale (« No checkpoints yet »). */
  title: string;

  /** Phrase d'aide optionnelle. */
  description?: string;

  /** Icône UnoCSS (`i-ph:*`). Défaut : plateau vide, neutre pour tout panneau. */
  icon?: string;

  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * État vide canonique des panneaux IDE : délègue à `ui/EmptyState` (variante
 * compacte) pour que TOUS les panneaux vides partagent la même carte
 * (pointillés, tuile d'icône, titre 15/600, description 13) au lieu des six
 * familles ad hoc recensées dans docs/UX_UNIFORMIZATION_AUDIT.md.
 */
export function PanelEmptyState({ title, description, icon, actionLabel, onAction, className }: PanelEmptyStateProps) {
  return (
    <EmptyState
      variant="compact"
      icon={icon ?? 'i-ph:tray'}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
      className={className}
    />
  );
}
