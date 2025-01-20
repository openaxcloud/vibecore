import { motion } from 'framer-motion';
import * as Tooltip from '@radix-ui/react-tooltip';
import { classNames } from '~/utils/classNames';
import type { TabVisibilityConfig } from '~/components/settings/settings.types';
import { TAB_LABELS } from '~/components/settings/settings.types';

const TAB_ICONS = {
  profile: 'i-ph:user',
  settings: 'i-ph:gear',
  notifications: 'i-ph:bell',
  features: 'i-ph:star',
  data: 'i-ph:database',
  providers: 'i-ph:plug',
  connection: 'i-ph:wifi-high',
  debug: 'i-ph:bug',
  'event-logs': 'i-ph:list-bullets',
  update: 'i-ph:arrow-clockwise',
};

interface TabTileProps {
  tab: TabVisibilityConfig;
  onClick: () => void;
  isActive?: boolean;
  hasUpdate?: boolean;
  statusMessage?: string;
  description?: string;
  isLoading?: boolean;
}

export const TabTile = ({
  tab,
  onClick,
  isActive = false,
  hasUpdate = false,
  statusMessage,
  description,
  isLoading = false,
}: TabTileProps) => {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <motion.button
            onClick={onClick}
            disabled={isLoading}
            className={classNames(
              'relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl',
              'w-full h-full min-h-[160px]',

              // Background and border styles
              'bg-white dark:bg-[#141414]',
              'border border-[#E5E5E5]/50 dark:border-[#333333]/50',

              // Shadow and glass effect
              'shadow-sm backdrop-blur-sm',
              'dark:shadow-[0_0_15px_rgba(0,0,0,0.1)]',
              'dark:bg-opacity-50',

              // Hover effects
              'hover:border-purple-500/30 dark:hover:border-purple-500/30',
              'hover:bg-gradient-to-br hover:from-purple-50/50 hover:to-white dark:hover:from-purple-500/5 dark:hover:to-[#141414]',
              'hover:shadow-md hover:shadow-purple-500/5',
              'dark:hover:shadow-purple-500/10',

              // Focus states for keyboard navigation
              'focus:outline-none',
              'focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2',
              'dark:focus:ring-offset-[#141414]',
              'focus:border-purple-500/30',

              // Active state
              isActive
                ? [
                    'border-purple-500/50 dark:border-purple-500/50',
                    'bg-gradient-to-br from-purple-50 to-white dark:from-purple-500/10 dark:to-[#141414]',
                    'shadow-md shadow-purple-500/10',
                  ]
                : '',

              // Loading state
              isLoading ? 'cursor-wait opacity-70' : '',

              // Transitions
              'transition-all duration-300 ease-out',
              'group',
            )}
            whileHover={
              !isLoading
                ? {
                    scale: 1.02,
                    transition: { duration: 0.2, ease: 'easeOut' },
                  }
                : {}
            }
            whileTap={
              !isLoading
                ? {
                    scale: 0.98,
                    transition: { duration: 0.1, ease: 'easeIn' },
                  }
                : {}
            }
          >
            {/* Loading Overlay */}
            {isLoading && (
              <motion.div
                className={classNames(
                  'absolute inset-0 rounded-xl z-10',
                  'bg-white/50 dark:bg-black/50',
                  'backdrop-blur-sm',
                  'flex items-center justify-center',
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <motion.div
                  className={classNames('w-8 h-8 rounded-full', 'border-2 border-purple-500/30', 'border-t-purple-500')}
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              </motion.div>
            )}

            {/* Status Indicator */}
            {hasUpdate && (
              <motion.div
                className={classNames(
                  'absolute top-3 right-3',
                  'w-2.5 h-2.5 rounded-full',
                  'bg-green-500',
                  'shadow-lg shadow-green-500/20',
                  'ring-4 ring-green-500/20',
                )}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
              />
            )}

            {/* Background glow effect */}
            <div
              className={classNames(
                'absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100',
                'bg-gradient-to-br from-purple-500/5 to-transparent dark:from-purple-500/10',
                'transition-opacity duration-300',
                isActive ? 'opacity-100' : '',
              )}
            />

            {/* Icon */}
            <div
              className={classNames(
                TAB_ICONS[tab.id],
                'w-12 h-12',
                'relative',
                'text-gray-600 dark:text-gray-300',
                'group-hover:text-purple-500 dark:group-hover:text-purple-400',
                'transition-all duration-300',
                isActive ? 'text-purple-500 dark:text-purple-400 scale-110' : '',
              )}
            />

            {/* Label and Description */}
            <div className="relative flex flex-col items-center text-center">
              <div
                className={classNames(
                  'text-base font-medium',
                  'text-gray-700 dark:text-gray-200',
                  'group-hover:text-purple-500 dark:group-hover:text-purple-400',
                  'transition-colors duration-300',
                  isActive ? 'text-purple-500 dark:text-purple-400' : '',
                )}
              >
                {TAB_LABELS[tab.id]}
              </div>
              {description && (
                <div
                  className={classNames(
                    'text-xs mt-1',
                    'text-gray-500 dark:text-gray-400',
                    'group-hover:text-purple-400/70 dark:group-hover:text-purple-300/70',
                    'transition-colors duration-300',
                    'max-w-[180px]',
                    isActive ? 'text-purple-400/70 dark:text-purple-300/70' : '',
                  )}
                >
                  {description}
                </div>
              )}
            </div>

            {/* Bottom indicator line */}
            <div
              className={classNames(
                'absolute bottom-0 left-1/2 -translate-x-1/2',
                'w-12 h-0.5 rounded-full',
                'bg-purple-500/0 group-hover:bg-purple-500/50',
                'transition-all duration-300 ease-out',
                'transform scale-x-0 group-hover:scale-x-100',
                isActive ? 'bg-purple-500 scale-x-100' : '',
              )}
            />
          </motion.button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className={classNames(
              'px-3 py-1.5 rounded-lg',
              'bg-[#18181B] text-white',
              'text-sm font-medium',
              'shadow-xl',
              'select-none',
              'z-[100]',
            )}
            side="top"
            sideOffset={5}
          >
            {statusMessage || TAB_LABELS[tab.id]}
            <Tooltip.Arrow className="fill-[#18181B]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};
