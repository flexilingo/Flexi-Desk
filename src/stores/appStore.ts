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

export const useAppStore = create<AppState>()(
  immer((set) => ({
    sidebarOpen: true,
    theme: 'system',
    currentPage: 'Dashboard',

    toggleSidebar: () =>
      set((state) => {
        state.sidebarOpen = !state.sidebarOpen;
      }),

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
      }),

    setCurrentPage: (page) =>
      set((state) => {
        state.currentPage = page;
      }),
  })),
);
