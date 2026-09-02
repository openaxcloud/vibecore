import { useStore } from '@nanostores/react';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { downscaleAvatarDataUrl, isQuotaExceededError } from './avatar-upload';
import { formatProfileTabCopy, getProfileTabCopy } from '~/lib/i18n/catalogs/profile-tab';
import { profileStore, updateProfile } from '~/lib/stores/profile';
import { useCoarsePointer } from '~/lib/hooks/useCoarsePointer';
import { classNames } from '~/utils/classNames';
import { debounce } from '~/utils/debounce';

export default function ProfileTab() {
  const coarse = useCoarsePointer();
  const { i18n } = useTranslation();
  const copy = getProfileTabCopy(i18n.resolvedLanguage ?? i18n.language);
  const profile = useStore(profileStore);
  const [isUploading, setIsUploading] = useState(false);

  // Create debounced update functions
  const debouncedUpdate = useCallback(
    debounce((field: 'username' | 'bio', value: string) => {
      updateProfile({ [field]: value });
      toast.success(copy[field === 'username' ? 'profileTab.toast.usernameUpdated' : 'profileTab.toast.bioUpdated']);
    }, 1000),
    [copy],
  );

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsUploading(true);

      // Convert the file to base64
      const reader = new FileReader();

      reader.onloadend = async () => {
        try {
          const base64String = reader.result as string;

          /*
           * Downscale/compress before persisting. A raw photo encoded as base64
           * easily exceeds the ~5MB localStorage quota; shrinking it keeps the
           * write within budget. Falls back to the original if compression fails.
           */
          const optimized = await downscaleAvatarDataUrl(base64String);

          /*
           * updateProfile persists synchronously to localStorage and can throw
           * QuotaExceededError, so this must stay inside the try/catch.
           */
          updateProfile({ avatar: optimized });
          toast.success(copy['profileTab.toast.avatarUpdated']);
        } catch (error) {
          console.error('Error saving avatar:', error);

          if (isQuotaExceededError(error)) {
            toast.error(copy['profileTab.toast.avatarTooLarge']);
          } else {
            toast.error(copy['profileTab.toast.avatarFailed']);
          }
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        console.error('Error reading file:', reader.error);
        setIsUploading(false);
        toast.error(copy['profileTab.toast.avatarFailed']);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setIsUploading(false);
      toast.error(copy['profileTab.toast.avatarFailed']);
    }
  };

  const handleProfileUpdate = (field: 'username' | 'bio', value: string) => {
    // Update the store immediately for UI responsiveness
    updateProfile({ [field]: value });

    // Debounce the toast notification
    debouncedUpdate(field, value);
  };

  return (
    <div className="mx-auto min-w-0 max-w-2xl">
      <div className="space-y-6">
        {/* Personal Information Section */}
        <div>
          {/* Avatar Upload */}
          <div className="mb-8 flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:gap-6">
            <div
              className={classNames(
                'w-24 h-24 rounded-full overflow-hidden',
                'bg-bolt-elements-background-depth-3/50',
                'flex items-center justify-center',
                'ring-1 ring-bolt-elements-borderColor',
                'relative group',
                'transition-all duration-300 ease-out',
                'hover:ring-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)]',
                'hover:shadow-lg',
              )}
            >
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={
                    profile.username
                      ? formatProfileTabCopy(copy['profileTab.avatar.altWithName'], { name: profile.username })
                      : copy['profileTab.avatar.alt']
                  }
                  className={classNames(
                    'w-full h-full object-cover',
                    'transition-all duration-300 ease-out',
                    'group-hover:scale-105 group-hover:brightness-90',
                  )}
                />
              ) : (
                <div className="i-ph:robot-fill w-16 h-16 text-bolt-elements-textTertiary transition-colors group-hover:text-[color-mix(in_srgb,var(--vc-ide-accent-action)_70%,transparent)] transform -translate-y-1" />
              )}

              <label
                htmlFor="profile-avatar"
                className={classNames(
                  'absolute inset-0',
                  'flex items-center justify-center',
                  'bg-black/0 group-hover:bg-black/40',
                  'cursor-pointer transition-all duration-300 ease-out',
                  isUploading ? 'cursor-wait' : '',
                )}
              >
                <input
                  id="profile-avatar"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={isUploading}
                  aria-label={copy['profileTab.avatar.inputLabel']}
                />
                {isUploading ? (
                  <div
                    className="i-ph:spinner-gap h-6 w-6 animate-spin text-white"
                    role="status"
                    aria-label={copy['profileTab.avatar.uploading']}
                  />
                ) : (
                  <div
                    className={classNames(
                      'i-ph:camera-plus h-6 w-6 transform text-white transition-all duration-300 ease-out group-hover:scale-110',
                      /*
                       * L'indice « on peut changer sa photo » n'apparaissait
                       * qu'au survol : au doigt, rien ne signalait que l'avatar
                       * etait actionnable.
                       */
                      coarse ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                    aria-hidden
                  />
                )}
              </label>
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <label
                htmlFor="profile-avatar"
                className="mb-1 block break-words text-base font-medium text-bolt-elements-textPrimary"
              >
                {copy['profileTab.avatar.title']}
              </label>
              <p className="break-words text-sm text-bolt-elements-textTertiary">
                {copy['profileTab.avatar.description']}
              </p>
            </div>
          </div>

          {/* Username Input */}
          <div className="mb-6">
            <label htmlFor="profile-username" className="mb-2 block text-sm font-medium text-bolt-elements-textPrimary">
              {copy['profileTab.username.label']}
            </label>
            <div className="relative group">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                <div className="i-ph:user-circle-fill w-5 h-5 text-bolt-elements-textTertiary transition-colors group-focus-within:text-[var(--vc-ide-accent-action)]" />
              </div>
              <input
                id="profile-username"
                type="text"
                value={profile.username}
                onChange={(e) => handleProfileUpdate('username', e.target.value)}
                className={classNames(
                  'w-full pl-11 pr-4 py-2.5 rounded-xl',
                  'bg-bolt-elements-background-depth-2',
                  'border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary',
                  'placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-focus-ring)] focus:border-[var(--vc-ide-accent-action)]',
                  'transition-all duration-300 ease-out',
                )}
                placeholder={copy['profileTab.username.placeholder']}
              />
            </div>
          </div>

          {/* Bio Input */}
          <div className="mb-8">
            <label htmlFor="profile-bio" className="mb-2 block text-sm font-medium text-bolt-elements-textPrimary">
              {copy['profileTab.bio.label']}
            </label>
            <div className="relative group">
              <div className="absolute left-3.5 top-3">
                <div className="i-ph:text-aa w-5 h-5 text-bolt-elements-textTertiary transition-colors group-focus-within:text-[var(--vc-ide-accent-action)]" />
              </div>
              <textarea
                id="profile-bio"
                value={profile.bio}
                onChange={(e) => handleProfileUpdate('bio', e.target.value)}
                className={classNames(
                  'w-full pl-11 pr-4 py-2.5 rounded-xl',
                  'bg-bolt-elements-background-depth-2',
                  'border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary',
                  'placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-focus-ring)] focus:border-[var(--vc-ide-accent-action)]',
                  'transition-all duration-300 ease-out',
                  'resize-none',
                  'h-32',
                )}
                placeholder={copy['profileTab.bio.placeholder']}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
