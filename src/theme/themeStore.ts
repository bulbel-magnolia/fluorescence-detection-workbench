import { create } from 'zustand';

export type AppearanceTheme = 'dark' | 'light';

const storageKey = 'fluorescence-desktop.appearance-theme.v1';

function initialTheme(): AppearanceTheme {
  if (typeof localStorage === 'undefined') return 'dark';
  return localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark';
}

interface ThemeState {
  theme: AppearanceTheme;
  setTheme: (theme: AppearanceTheme) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, theme);
    set({ theme });
  },
}));
