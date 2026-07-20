import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './ProjectActionsMenu.module.scss';

export function ProjectActionsMenu({
  projectName,
  open,
  onOpenChange,
  children,
}: {
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={styles.trigger}
          aria-label={`Project actions for ${projectName}`}
          title={`Project actions for ${projectName}`}
          data-testid="project-actions-menu-trigger"
        >
          <ChevronDown className={styles.chevron} data-open={open ? 'true' : 'false'} aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          side="bottom"
          sideOffset={5}
          collisionPadding={12}
          hideWhenDetached
          className={styles.content}
          aria-label={`Project actions for ${projectName}`}
          data-testid="project-actions-menu"
        >
          {children}
          <PopoverPrimitive.Arrow className={styles.arrow} aria-hidden />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
