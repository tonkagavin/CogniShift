import { Navigate, Route, Routes } from "react-router-dom";
import { LandingRoute } from "../routes/LandingRoute";
import { CalibrateRoute } from "../routes/CalibrateRoute";
import { DashboardRoute } from "../routes/DashboardRoute";
import { ProfileRoute } from "../routes/ProfileRoute";
import { LibraryRoute } from "../routes/LibraryRoute";
import { CompareRoute } from "../routes/CompareRoute";
import { SettingsRoute } from "../routes/SettingsRoute";
import { OnboardingRoute } from "../routes/OnboardingRoute";
import { useSupabaseAuthStore } from "../state/supabaseAuthStore";
import { assertSupabaseConfigured } from "../features/supabase/client";
import { useEffect, useState, type ReactElement } from "react";

function RequireCalibrated({ children }: { children: ReactElement }) {
  const user = useSupabaseAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);
  const [calibrated, setCalibrated] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) {
        setReady(true);
        setCalibrated(false);
        return;
      }
      const supabase = assertSupabaseConfigured();
      const { data } = await supabase
        .from("user_profiles")
        .select("calibration_complete")
        .eq("id", user.id)
        .maybeSingle();
      setCalibrated(Boolean(data?.calibration_complete));
      setReady(true);
    };
    void run();
  }, [user?.id]);

  if (!user) return <Navigate to="/" replace />;
  if (!ready) return <Navigate to="/" replace />;
  if (!calibrated) return <Navigate to="/onboarding" replace />;
  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route path="/calibrate" element={<CalibrateRoute />} />
      <Route
        path="/dashboard"
        element={
          <RequireCalibrated>
            <DashboardRoute />
          </RequireCalibrated>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireCalibrated>
            <ProfileRoute />
          </RequireCalibrated>
        }
      />
      <Route
        path="/library"
        element={
          <RequireCalibrated>
            <LibraryRoute />
          </RequireCalibrated>
        }
      />
      <Route
        path="/compare"
        element={
          <RequireCalibrated>
            <CompareRoute />
          </RequireCalibrated>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireCalibrated>
            <SettingsRoute />
          </RequireCalibrated>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

