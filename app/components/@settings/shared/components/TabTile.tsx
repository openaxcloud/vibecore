import * as Tooltip from '@radix-ui/react-tooltip';
import { TAB_LABELS, TAB_ICONS } from '~/components/@settings/core/constants';
import type { TabVisibilityConfig } from '~/components/@settings/core/types';
import { GlowingEffect } from '~/components/ui/GlowingEffect';
import { classNames } from '~/utils/classNames';

interface TabTileProps {
  tab: TabVisibilityConfig;
  onClick?: () => void;
  isActive?: boolean;
  hasUpdate?: boolean;
  statusMessage?: string;
  description?: string;
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const TabTile: React.FC<TabTileProps> = ({
  tab,
  onClick,
  isActive,
  hasUpdate,
  statusMessage,
  description,
  isLoading,
  className,
  children,
}: TabTileProps) => {
  return (
    <Tooltip.Provider delayDuration={500}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className={classNames('min-h-[160px] list-none', className || '')}>
            <div className="relative h-full rounded-xl border border-bolt-elements-borderColor p-0.5">
              <GlowingEffect
                blur={0}
                borderWidth={1}
                spread={20}
                glow={true}
                disabled={false}
                proximity={40}
                inactiveZone={0.3}
                movementDuration={0.4}
              />
              <div
                role="button"
                aria-label={TAB_LABELS[tab.id]}
                tabIndex={isLoading ? -1 : 0}
                aria-pressed={isActive}
                onClick={onClick}
                onKeyDown={(event) => {
                  if (!isLoading && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onClick?.();
                  }
                }}
                className={classNames(
                  'relative flex flex-col items-center justify-center h-full p-4 rounded-lg',
                  'bg-bolt-elements-background-depth-2',
                  'group cursor-pointer',
                  'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_8%,transparent)]',
                  'transition-colors duration-100 ease-out',
                  isActive ? 'bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_8%,transparent)]' : '',
                  isLoading ? 'cursor-wait opacity-70 pointer-events-none' : '',
                )}
              >
                {/* Icon */}
                <div
                  className={classNames(
                    'relative',
                    'w-14 h-14',
                    'flex items-center justify-center',
                    'rounded-xl',
                    'bg-bolt-elements-background-depth-3',
                    'ring-1 ring-bolt-elements-borderColor',
                    'group-hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_12%,transparent)]',
                    'group-hover:ring-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)]',
                    'transition-all duration-100 ease-out',
                    isActive
                      ? 'bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] ring-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)]'
                      : '',
                  )}
                >
                  {(() => {
                    const IconComponent = TAB_ICONS[tab.id];
                    return (
                      <IconComponent
                        className={classNames(
                          'w-8 h-8',
                          'text-bolt-elements-textSecondary',
                          'group-hover:text-[var(--vc-ide-accent-action)]',
                          'transition-colors duration-100 ease-out',
                          isActive ? 'text-[var(--vc-ide-accent-action)]' : '',
                        )}
                      />
                    );
                  })()}
                </div>

                {/* Label and Description */}
                <div className="flex flex-col items-center mt-4 w-full">
                  <h3
                    className={classNames(
                      'text-[15px] font-medium leading-snug mb-2',
                      'text-bolt-elements-textSecondary',
                      'group-hover:text-[var(--vc-ide-accent-action)]',
                      'transition-colors duration-100 ease-out',
                      isActive ? 'text-[var(--vc-ide-accent-action)]' : '',
                    )}
                  >
                    {TAB_LABELS[tab.id]}
                  </h3>
                  {description && (
                    <p
                      className={classNames(
                        'text-[13px] leading-relaxed',
                        'text-bolt-elements-textTertiary',
                        'max-w-[85%]',
                        'text-center',
                        'group-hover:text-[var(--vc-ide-accent-action)]',
                        'transition-colors duration-100 ease-out',
                        isActive ? 'text-[var(--vc-ide-accent-action)]' : '',
                      )}
                    >
                      {description}
                    </p>
                  )}
                </div>

                {/* Update Indicator with Tooltip */}
                {hasUpdate && (
                  <>
                    <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[var(--vc-ide-accent-action)] animate-pulse" />
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className={classNames(
                          'px-3 py-1.5 rounded-lg',
                          'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary border border-bolt-elements-borderColor',
                          'text-sm font-medium',
                          'select-none',
                          'z-[100]',
                        )}
                        side="top"
                        sideOffset={5}
                      >
                        {statusMessage}
                        <Tooltip.Arrow className="fill-[var(--bolt-elements-bg-depth-3)]" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </>
                )}

                {/* Children (e.g. Beta Label) */}
                {children}
              </div>
            </div>
          </div>
        </Tooltip.Trigger>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};
