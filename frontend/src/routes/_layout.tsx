import * as React from "react";
import { Link, NavLink } from "react-router-dom";

const navItems: Array<{ to: string; label: string }> = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/calibrate", label: "Calibrate" },
  { to: "/library", label: "Library" },
  { to: "/compare", label: "Compare" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
];

export function Page({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="appShell">
      <header className="topBar">
        <Link to="/" className="brand">
          CogniShift
        </Link>
        <nav className="nav">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) => (isActive ? "navLink active" : "navLink")}
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="main">
        <h1 className="pageTitle">{title}</h1>
        {children}
      </main>
    </div>
  );
}

