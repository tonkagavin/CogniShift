import * as React from "react";
import { useEffect } from "react";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const initAuth = useSupabaseAuthStore((s) => s.init);
  useEffect(() => {
    void initAuth();
  }, [initAuth]);
  return <>{children}</>;
}

