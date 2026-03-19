import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface AuthSession {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
  expires_at: number;
}

interface AuthState {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      const session = await invoke<AuthSession | null>('auth_get_session');
      if (session) {
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now + 60) {
          try {
            const refreshed = await invoke<AuthSession>('auth_refresh');
            set({ session: refreshed, isLoading: false });
            return;
          } catch {
            set({ session: null, isLoading: false });
            return;
          }
        }
        set({ session, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  sendOtp: async (email: string) => {
    try {
      await invoke('auth_send_otp', { email });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  verifyOtp: async (email: string, otp: string) => {
    set({ isLoading: true, error: null });
    try {
      const session = await invoke<AuthSession>('auth_verify_otp', { email, otp });
      set({ session, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      await invoke('auth_logout');
    } catch {
      /* ignore */
    }
    set({ session: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
