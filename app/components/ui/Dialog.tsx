import * as RadixDialog from '@radix-ui/react-dialog';
import { motion, type Variants } from 'framer-motion';
import React, { memo, type ReactNode, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { I18nContext } from 'react-i18next';
import { FixedSizeList } from 'react-window';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { IconButton } from './IconButton';
import { Label } from './Label';
import { isAllSelected } from './selection-dialog-utils';
import {
  formatSearchDataSettingsNumber,
  formatSearchDataSettingsPlural,
  getDataSettingsCopy,
  interpolateSearchDataSettingsCopy,
  resolveSearchDataSettingsLanguage,
} from '~/lib/i18n/catalogs/search-data-settings';
import { detectUserLanguage } from '~/lib/i18n/language';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

export { Close as DialogClose, Root as DialogRoot } from '@radix-ui/react-dialog';

interface DialogButtonProps {
  type: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
  onClick?: (event: React.MouseEvent) => void;
  disabled?: boolean;
}

export const DialogButton = memo(({ type, children, onClick, disabled }: DialogButtonProps) => {
  return (
    <button
      className={classNames(
        'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors',

        /*
         * UNIF lot 5 : primary de dialog = la même famille surface-aware que
         * ui/Button `primary` (`--vc-action-primary` → accent action bleu dans
         * l'IDE, orange user area, accents auth/marketing). Hover = fond
         * assombri (pas d'opacity, illisible sur certains fonds).
         */
        type === 'primary'
          ? 'bg-[var(--vc-action-primary)] text-[var(--vc-action-primary-foreground)] hover:bg-[var(--vc-action-primary-hover)]'
          : type === 'secondary'
            ? 'bg-transparent text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary'
            : 'bg-transparent text-bolt-elements-button-danger-text hover:bg-bolt-elements-button-danger-background',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
});

export const DialogTitle = memo(({ className, children, ...props }: RadixDialog.DialogTitleProps) => {
  return (
    <RadixDialog.Title
      className={classNames(
        'flex min-w-0 items-center gap-2 break-words text-lg font-medium text-bolt-elements-textPrimary',
        className,
      )}
      {...props}
    >
      {children}
    </RadixDialog.Title>
  );
});

export const DialogDescription = memo(({ className, children, ...props }: RadixDialog.DialogDescriptionProps) => {
  return (
    <RadixDialog.Description
      className={classNames('text-sm text-bolt-elements-textSecondary mt-1', className)}
      {...props}
    >
      {children}
    </RadixDialog.Description>
  );
});

const transition = {
  duration: 0.15,
  ease: cubicEasingFn,
};

export const dialogBackdropVariants = {
  closed: {
    opacity: 0,
    transition,
  },
  open: {
    opacity: 1,
    transition,
  },
} satisfies Variants;

export const dialogVariants = {
  closed: {
    x: '-50%',
    y: '-40%',
    scale: 0.96,
    opacity: 0,
    transition,
  },
  open: {
    x: '-50%',
    y: '-50%',
    scale: 1,
    opacity: 1,
    transition,
  },
} satisfies Variants;

/**
 * Dialogs also appear in isolated component tests and recovery boundaries that
 * do not mount I18nextProvider. Reading the context directly avoids noisy
 * NO_I18NEXT_INSTANCE warnings while still subscribing to live language
 * changes whenever a provider is present.
 */
export function useDialogLanguage() {
  const i18n = useContext(I18nContext)?.i18n;

  return useSyncExternalStore(
    (onStoreChange) => {
      if (!i18n) {
        return () => undefined;
      }

      const handleLanguageChanged = () => onStoreChange();
      i18n.on('languageChanged', handleLanguageChanged);

      return () => i18n.off('languageChanged', handleLanguageChanged);
    },
    () => resolveSearchDataSettingsLanguage(i18n?.resolvedLanguage ?? i18n?.language ?? detectUserLanguage()),
    () => resolveSearchDataSettingsLanguage(i18n?.resolvedLanguage ?? i18n?.language ?? 'en'),
  );
}

interface DialogProps {
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
  onClose?: () => void;
  onBackdrop?: () => void;
}

export const Dialog = memo(({ children, className, showCloseButton = true, onClose, onBackdrop }: DialogProps) => {
  const language = useDialogLanguage();
  const sharedCopy = getDataSettingsCopy(language).sharedDialog;

  /*
   * Only dismiss on a genuine backdrop TAP, not a swipe/pan. On mobile, panning to
   * scroll the modal (or a stray horizontal drag) used to end on the overlay and
   * close the dialog, bouncing the user out. Track the pointer-down point and skip
   * dismissal if it moved more than a few px.
   */
  const backdropDownRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay asChild>
        <motion.div
          className={classNames('fixed inset-0 z-[9999] bg-black/70 dark:bg-black/80 backdrop-blur-sm')}
          initial="closed"
          animate="open"
          exit="closed"
          variants={dialogBackdropVariants}
          onPointerDown={(event) => {
            backdropDownRef.current = { x: event.clientX, y: event.clientY };
          }}
          onClick={(event) => {
            const start = backdropDownRef.current;
            backdropDownRef.current = null;

            if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
              return;
            }

            onBackdrop?.();
          }}
        />
      </RadixDialog.Overlay>
      <RadixDialog.Content asChild>
        <motion.div
          className={classNames(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bolt-elements-background-depth-2 rounded-lg shadow-xl border border-bolt-elements-borderColor z-[9999] w-[min(520px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-hidden focus:outline-none',
            className,
          )}
          initial="closed"
          animate="open"
          exit="closed"
          variants={dialogVariants}
        >
          <div className="flex max-h-[calc(100dvh-24px)] min-h-0 flex-col overflow-auto">
            {children}
            {showCloseButton && (
              <RadixDialog.Close asChild>
                <IconButton
                  icon="i-ph:x"
                  title={sharedCopy.close}
                  className="absolute top-3 right-3 h-9 w-9 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary"
                  onClick={onClose}
                />
              </RadixDialog.Close>
            )}
          </div>
        </motion.div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
});

/**
 * Props for the ConfirmationDialog component
 */
export interface ConfirmationDialogProps {
  /**
   * Whether the dialog is open
   */
  isOpen: boolean;

  /**
   * Callback when the dialog is closed
   */
  onClose: () => void;

  /**
   * Callback when the confirm button is clicked
   */
  onConfirm: () => void;

  /**
   * The title of the dialog
   */
  title: string;

  /**
   * The description of the dialog. Accepts rich content (e.g. a restore
   * diffstat) as well as plain strings.
   */
  description: ReactNode;

  /**
   * The text for the confirm button
   */
  confirmLabel?: string;

  /**
   * The text for the cancel button
   */
  cancelLabel?: string;

  /**
   * The variant of the confirm button
   */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';

  /**
   * Whether the confirm button is in a loading state
   */
  isLoading?: boolean;
}

/**
 * A reusable confirmation dialog component that uses the Dialog component
 */
export function ConfirmationDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  isLoading = false,
  onConfirm,
}: ConfirmationDialogProps) {
  const language = useDialogLanguage();
  const sharedCopy = getDataSettingsCopy(language).sharedDialog;
  const resolvedConfirmLabel = confirmLabel ?? sharedCopy.confirm;
  const resolvedCancelLabel = cancelLabel ?? sharedCopy.cancel;

  return (
    <RadixDialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog showCloseButton={false}>
        <div className="p-6 bg-bolt-elements-background-depth-2 relative z-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mb-4">{description}</DialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="!h-auto min-h-9 !whitespace-normal break-words py-2 text-center leading-tight"
            >
              {resolvedCancelLabel}
            </Button>
            <Button
              variant={variant}
              onClick={onConfirm}
              disabled={isLoading}
              className={classNames(
                '!h-auto min-h-9 !whitespace-normal break-words py-2 text-center leading-tight',
                variant === 'destructive'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent hover:bg-bolt-elements-button-primary-backgroundHover',
              )}
            >
              {isLoading ? (
                <>
                  <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                  {resolvedConfirmLabel}
                </>
              ) : (
                resolvedConfirmLabel
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </RadixDialog.Root>
  );
}

/**
 * Type for selection item in SelectionDialog
 */
type SelectionItem = {
  id: string;
  label: string;
  description?: string;
};

/**
 * Props for the SelectionDialog component
 */
export interface SelectionDialogProps {
  /**
   * The title of the dialog
   */
  title: string;

  /**
   * The items to select from
   */
  items: SelectionItem[];

  /**
   * Whether the dialog is open
   */
  isOpen: boolean;

  /**
   * Callback when the dialog is closed
   */
  onClose: () => void;

  /**
   * Callback when the confirm button is clicked with selected item IDs
   */
  onConfirm: (selectedIds: string[]) => void;

  /**
   * The text for the confirm button
   */
  confirmLabel?: string;

  /**
   * The maximum height of the selection list
   */
  maxHeight?: string;
}

/**
 * A reusable selection dialog component that uses the Dialog component
 */
export function SelectionDialog({
  title,
  items,
  isOpen,
  onClose,
  onConfirm,
  confirmLabel,
  maxHeight = '60vh',
}: SelectionDialogProps) {
  const language = useDialogLanguage();
  const sharedCopy = getDataSettingsCopy(language).sharedDialog;
  const resolvedConfirmLabel = confirmLabel ?? sharedCopy.confirm;
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  /*
   * Derive the "all selected" state from the actual selection so the label stays
   * in sync even when items are toggled individually.
   */
  const allSelected = isAllSelected(selectedItems.length, items.length);

  // Reset selected items when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedItems([]);
    }
  }, [isOpen]);

  const handleToggleItem = (id: string) => {
    setSelectedItems((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map((item) => item.id));
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedItems);
    onClose();
  };

  // Calculate the height for the virtualized list
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
  const parsedMaxHeightVh = parseInt(maxHeight.replace('vh', ''), 10);
  const maxHeightVh = Number.isFinite(parsedMaxHeightVh) ? parsedMaxHeightVh : 60;
  const listHeight = Math.min(items.length * 60, maxHeightVh * viewportHeight * 0.01 - 40);

  // Render each item in the virtualized list
  const ItemRenderer = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = items[index];
    return (
      <div
        key={item.id}
        className={classNames(
          'flex items-start space-x-3 p-2 rounded-md transition-colors',
          selectedItems.includes(item.id)
            ? 'bg-bolt-elements-item-backgroundAccent'
            : 'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-item-backgroundActive',
        )}
        style={{
          ...style,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <Checkbox
          id={`item-${item.id}`}
          checked={selectedItems.includes(item.id)}
          onCheckedChange={() => handleToggleItem(item.id)}
        />
        <div className="grid min-w-0 gap-1.5 leading-none">
          <Label
            htmlFor={`item-${item.id}`}
            className={classNames(
              'cursor-pointer break-words text-sm font-medium',
              selectedItems.includes(item.id)
                ? 'text-bolt-elements-item-contentAccent'
                : 'text-bolt-elements-textPrimary',
            )}
          >
            {item.label}
          </Label>
          {item.description && (
            <p className="break-words text-xs text-bolt-elements-textSecondary">{item.description}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <RadixDialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog showCloseButton={false}>
        <div className="p-6 bg-bolt-elements-background-depth-2 relative z-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-2 mb-4 break-words">
            {interpolateSearchDataSettingsCopy(sharedCopy.selectionDescription, {
              action: resolvedConfirmLabel,
            })}
          </DialogDescription>

          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-bolt-elements-textSecondary">
                {formatSearchDataSettingsPlural(
                  language,
                  selectedItems.length,
                  {
                    one: sharedCopy.selectionSummary_one,
                    other: sharedCopy.selectionSummary_other,
                  },
                  {
                    selected: formatSearchDataSettingsNumber(selectedItems.length, language),
                    total: formatSearchDataSettingsNumber(items.length, language),
                  },
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="!h-auto min-h-8 !whitespace-normal break-words bg-bolt-elements-background-depth-2 px-2 py-2 text-center text-xs leading-tight text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundAccent hover:text-bolt-elements-item-contentAccent dark:bg-transparent"
              >
                {allSelected ? sharedCopy.deselectAll : sharedCopy.selectAll}
              </Button>
            </div>

            <div
              className="pr-2 border rounded-md border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
              style={{
                maxHeight,
              }}
            >
              {items.length > 0 ? (
                <FixedSizeList
                  height={listHeight}
                  width="100%"
                  itemCount={items.length}
                  itemSize={60}
                  className="scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-bolt-elements-background-depth-3"
                >
                  {ItemRenderer}
                </FixedSizeList>
              ) : (
                <div className="py-4 text-center text-sm text-bolt-elements-textTertiary">{sharedCopy.noItems}</div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="!h-auto min-h-9 !whitespace-normal break-words border-bolt-elements-borderColor py-2 text-center leading-tight text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive"
            >
              {sharedCopy.cancel}
            </Button>
            {/* UNIF lot 5 : primary canonique (variant) au lieu du legacy statique `bg-accent-500`. */}
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={selectedItems.length === 0}
              className="!h-auto min-h-9 !whitespace-normal break-words py-2 text-center leading-tight"
            >
              {resolvedConfirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </RadixDialog.Root>
  );
}
