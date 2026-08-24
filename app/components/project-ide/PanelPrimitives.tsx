import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

import { EmptyState } from '~/components/ui/EmptyState';
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

export interface PanelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline';
  children?: ReactNode;
}

export function PanelButton({ children, variant, type, className, ...props }: PanelButtonProps) {
  return (
    <button
      {...props}
      type={type ?? 'submit'}
      className={classNames(
        'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium disabled:opacity-60',
        variant === 'outline'
          ? 'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3'
          : 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text',
        className,
      )}
    >
      {children}
    </button>
  );
}

export type PanelInputProps = InputHTMLAttributes<HTMLInputElement>;

export function PanelInput({ className, ...props }: PanelInputProps) {
  return (
    <input
      {...props}
      className={classNames(
        'h-9 min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm outline-none focus:border-bolt-elements-focus',
        className,
      )}
    />
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
