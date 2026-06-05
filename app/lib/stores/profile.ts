import { atom } from 'nanostores';

interface Profile {
  username: string;
  bio: string;
  avatar: string;
}

// Initialize with stored profile or defaults
const storedProfile = typeof window !== 'undefined' ? localStorage.getItem('bolt_profile') : null;

const defaultProfile: Profile = {
  username: '',
  bio: '',
  avatar: '',
};

function parseStoredProfile(raw: string | null): Profile {
  if (!raw) {
    return defaultProfile;
  }

  try {
    return { ...defaultProfile, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    // Corrupt localStorage must not crash module initialization.
    return defaultProfile;
  }
}

const initialProfile: Profile = parseStoredProfile(storedProfile);

export const profileStore = atom<Profile>(initialProfile);

export const updateProfile = (updates: Partial<Profile>) => {
  profileStore.set({ ...profileStore.get(), ...updates });

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('bolt_profile', JSON.stringify(profileStore.get()));
  }
};
