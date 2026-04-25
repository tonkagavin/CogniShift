import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { assertSupabaseConfigured } from "../features/supabase/client";

type SupabaseAuthStore = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

let unsubscribeAuth: (() => void) | null = null;

export const useSupabaseAuthStore = create<SupabaseAuthStore>((set) => ({
  user: null,
  session: null,
  loading: false,
  error: null,

  init: async () => {
    try {
      const sb = assertSupabaseConfigured();
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      set({ session: data.session, user: data.session?.user ?? null });

      if (!unsubscribeAuth) {
        const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
          set({ session, user: session?.user ?? null });
        });
        unsubscribeAuth = () => sub.subscription.unsubscribe();
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  signUp: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const sb = assertSupabaseConfigured();
      const { error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const sb = assertSupabaseConfigured();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      set({ session: data.session, user: data.user ?? null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    try {
      const sb = assertSupabaseConfigured();
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      set({ session: null, user: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

