import { Navigate, Route, Routes } from "react-router-dom";
import { LandingRoute } from "../routes/LandingRoute";
import { CalibrateRoute } from "../routes/CalibrateRoute";
import { DashboardRoute } from "../routes/DashboardRoute";
import { ProfileRoute } from "../routes/ProfileRoute";
import { LibraryRoute } from "../routes/LibraryRoute";
import { CompareRoute } from "../routes/CompareRoute";
import { SettingsRoute } from "../routes/SettingsRoute";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />
      <Route path="/calibrate" element={<CalibrateRoute />} />
      <Route path="/dashboard" element={<DashboardRoute />} />
      <Route path="/profile" element={<ProfileRoute />} />
      <Route path="/library" element={<LibraryRoute />} />
      <Route path="/compare" element={<CompareRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

