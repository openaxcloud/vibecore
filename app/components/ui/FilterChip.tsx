import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';

interface FilterChipProps {
  /** The label text to display */
  label: string;

  /** Optional value to display after the label */
  value?: string | number;

  /** Function to call when the chip itself is clicked (renders as a toggle button) */
  onClick?: () => void;

  /** Function to call when the remove button is clicked */
  onRemove?: () => void;

  /** Whether the chip is active/selected */
  active?: boolean;

  /** Optional icon to display before the label */
  icon?: string;

  /** Additional class name */
  className?: string;
}

// Animation variants
const variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

/**
 * FilterChip component
 *
 * A chip for displaying/toggling filters. Clickable chips render as toggle
 * buttons (aria-pressed) with the app's blue action accent when active, per
 * docs/DESIGN_ACCENTS.md.
 */
export function FilterChip({ label, value, onClick, onRemove, active = false, icon, className }: FilterChipProps) {
  const content = (
    <>
      {/* Icon */}
      {icon && <span className={classNames(icon, 'text-inherit')} />}

      {/* Label and value */}
      <span>
        {label}
        {value !== undefined && ': '}
        {value !== undefined && (
          <span
            className={
              active ? 'font-semibold' : 'text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark'
            }
          >
            {value}
          </span>
        )}
      </span>

      {/* Remove button */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={classNames(
            'ml-1 p-0.5 rounded-full hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4 transition-colors',
            active ? 'text-inherit' : 'text-bolt-elements-textTertiary dark:text-bolt-elements-textTertiary-dark',
          )}
          aria-label={`Remove ${label} filter`}
        >
          <span className="i-ph:x w-3 h-3" />
        </button>
      )}
    </>
  );

  const chipClasses = classNames(
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
    active
      ? 'border border-[var(--vc-ide-accent-action)] text-[var(--vc-ide-accent-action)]'
      : 'bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark',
    onRemove && 'pr-1',
    className,
  );

  const activeBackground = active
    ? { background: 'color-mix(in srgb, var(--vc-ide-accent-action) 12%, transparent)' }
    : undefined;

  if (onClick) {
    return (
      <motion.button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
        transition={{ duration: 0.2 }}
        className={classNames(
          chipClasses,
          'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
        )}
        style={activeBackground}
      >
        {content}
      </motion.button>
    );
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ duration: 0.2 }}
      className={chipClasses}
      style={activeBackground}
    >
      {content}
    </motion.div>
  );
}
