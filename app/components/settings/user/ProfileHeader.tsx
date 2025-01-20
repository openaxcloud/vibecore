import type { Dispatch, SetStateAction } from 'react';
import type { TabType, TabVisibilityConfig } from '~/components/settings/settings.types';

export interface ProfileHeaderProps {
  onNavigate: Dispatch<SetStateAction<TabType | null>>;
  visibleTabs: TabVisibilityConfig[];
}

export { type TabType };

export const ProfileHeader = ({ onNavigate, visibleTabs }: ProfileHeaderProps) => {
  return (
    <div className="flex items-center gap-2">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onNavigate(tab.id)}
          className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
        >
          {tab.id}
        </button>
      ))}
    </div>
  );
};
