import React, { useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import type { UserProfile } from '~/components/settings/settings.types';
import { motion } from 'framer-motion';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MIN_PASSWORD_LENGTH = 8;

export default function ProfileTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('bolt_user_profile');
    return saved
      ? JSON.parse(saved)
      : {
          name: '',
          email: '',
          password: '',
          bio: '',
        };
  });

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error('Please upload a valid image file (JPEG, PNG, or GIF)');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setIsLoading(true);

    try {
      const reader = new FileReader();

      reader.onloadend = () => {
        setProfile((prev) => ({ ...prev, avatar: reader.result as string }));
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload avatar');
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile.name.trim()) {
      toast.error('Name is required');
      return;
    }

    if (!profile.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (profile.password && profile.password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    setIsLoading(true);

    try {
      // Get existing profile data to preserve settings
      const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');

      // Merge with new profile data
      const updatedProfile = {
        ...existingProfile,
        name: profile.name,
        email: profile.email,
        password: profile.password,
        bio: profile.bio,
        avatar: profile.avatar,
      };

      localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));

      // Dispatch a storage event to notify other components
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'bolt_user_profile',
          newValue: JSON.stringify(updatedProfile),
        }),
      );

      toast.success('Profile settings saved successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={classNames(
        'rounded-lg border bg-bolt-elements-background text-bolt-elements-textPrimary shadow-sm p-4',
        'hover:bg-bolt-elements-background-depth-2',
        'transition-all duration-200',
      )}
    >
      {/* Profile Information */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <div className="i-ph:user-circle-fill w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Personal Information</span>
        </div>
        <div className="flex items-start gap-4 p-4">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-12 h-12 rounded-lg bg-[#F5F5F5] dark:bg-[#1A1A1A] flex items-center justify-center overflow-hidden">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <div className="i-ph:spinner-gap-bold animate-spin text-purple-500" />
                ) : profile.avatar ? (
                  <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="i-ph:user-circle-fill text-bolt-elements-textSecondary" />
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
            >
              <div className="i-ph:camera-fill text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_FILE_TYPES.join(',')}
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          {/* Profile Fields */}
          <div className="flex-1 space-y-3">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <div className="i-ph:user-fill w-4 h-4 text-bolt-elements-textTertiary" />
              </div>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Enter your name"
                className={classNames(
                  'w-full px-3 py-1.5 rounded-lg text-sm',
                  'pl-10',
                  'bg-[#F5F5F5] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333]',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-purple-500',
                )}
              />
            </div>

            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <div className="i-ph:envelope-fill w-4 h-4 text-bolt-elements-textTertiary" />
              </div>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Enter your email"
                className={classNames(
                  'w-full px-3 py-1.5 rounded-lg text-sm',
                  'pl-10',
                  'bg-[#F5F5F5] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333]',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-purple-500',
                )}
              />
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={profile.password}
                onChange={(e) => setProfile((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Enter new password"
                className={classNames(
                  'w-full px-3 py-1.5 rounded-lg text-sm',
                  'bg-[#F5F5F5] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333]',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-purple-500',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={classNames(
                  'absolute right-3 top-1/2 -translate-y-1/2',
                  'flex items-center justify-center',
                  'w-6 h-6 rounded-md',
                  'text-bolt-elements-textSecondary',
                  'hover:text-bolt-elements-item-contentActive',
                  'hover:bg-bolt-elements-item-backgroundActive',
                  'transition-colors',
                )}
              >
                <div className={classNames(showPassword ? 'i-ph:eye-slash-fill' : 'i-ph:eye-fill', 'w-4 h-4')} />
              </button>
            </div>

            <div className="relative">
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
                placeholder="Tell us about yourself"
                rows={3}
                className={classNames(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-[#F5F5F5] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333]',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-1 focus:ring-purple-500',
                  'resize-none',
                )}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Save Button */}
      <div className="flex justify-end mt-6">
        <button
          onClick={handleSave}
          disabled={isLoading}
          className={classNames(
            'rounded-md px-4 py-2 text-sm',
            'bg-purple-500 text-white',
            'hover:bg-purple-600',
            'dark:bg-purple-500 dark:hover:bg-purple-600',
            'transition-all duration-200',
          )}
        >
          {isLoading ? (
            <>
              <div className="i-ph:spinner-gap-bold animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <div className="i-ph:check-circle-fill" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
