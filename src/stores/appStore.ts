import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface AppState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  currentPage: string;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCurrentPage: (page: string) => void;
}

// Remembered between launches, like the website's sidebar and theme.
const THEME_KEY = 'flexi-desk-theme';
const SIDEBAR_KEY = 'flexi-desk-sidebar';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the choice lasts for this session only.
  }
}

function initialTheme(): AppState['theme'] {
  const saved = stored(THEME_KEY);
  // Light is the default look; dark and "follow the system" are opt-in.
  return saved === 'dark' || saved === 'system' ? saved : 'light';
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    sidebarOpen: stored(SIDEBAR_KEY) !== 'collapsed',
    theme: initialTheme(),
    currentPage: 'Dashboard',

    toggleSidebar: () =>
      set((state) => {
        state.sidebarOpen = !state.sidebarOpen;
        remember(SIDEBAR_KEY, state.sidebarOpen ? 'open' : 'collapsed');
      }),

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
        remember(THEME_KEY, theme);
      }),

    setCurrentPage: (page) =>
      set((state) => {
        state.currentPage = page;
      }),
  })),
);
