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
  /** System-browser Google sign-in (loopback OAuth in Rust). */
  signInWithGoogle: () => Promise<void>;
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
            // Rust already signed the user out (and deleted the session) if the refresh token
            // was rejected. After any other failure (offline, rate limit, server error) the
            // stored session is still valid: keep it and let the next request refresh it.
            const stillStored = await invoke<AuthSession | null>('auth_get_session').catch(
              () => null,
            );
            set({ session: stillStored, isLoading: false });
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

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      const session = await invoke<AuthSession>('auth_google_sign_in');
      set({ session, isLoading: false });
    } catch (e) {
      set({ error: String(e) });
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
