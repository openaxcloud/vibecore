import { memo } from 'react';
import { classNames } from '~/utils/classNames';

interface PanelHeaderProps {
  className?: string;
  children: React.ReactNode;
}

/*
 * UNIF-06 (audit H1) : hauteur alignée sur le standard 36 px de l'en-tête
 * commun des panneaux IDE (.bolt-project-ide-panel-header) — fin du double
 * standard 34/36 px.
 */
export const PanelHeader = memo(({ className, children }: PanelHeaderProps) => {
  return (
    <div
      className={classNames(
        'flex items-center gap-2 bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary border-b border-bolt-elements-borderColor px-4 py-1 min-h-[36px] text-sm',
        className,
      )}
    >
      {children}
    </div>
  );
});
