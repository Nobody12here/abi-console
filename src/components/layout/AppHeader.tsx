import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Menu, Moon, Sun, X } from "lucide-react";
import { Brand } from "./Brand";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Contracts", end: true },
  { to: "/import", label: "Add contract", end: false },
  { to: "/settings", label: "Settings", end: false },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "nav-link",
              // Contract pages belong to the Contracts section.
              (isActive || (item.to === "/" && pathname.startsWith("/contract/"))) &&
                "active",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

export function AppHeader() {
  const { resolvedTheme, updateSettings } = useWorkspace();
  const { pathname } = useLocation();
  // Storing the path the menu was opened on closes it automatically on navigation.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuPath(null);
      menuButtonRef.current?.focus();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (
        headerRef.current &&
        !headerRef.current.contains(event.target as Node)
      ) {
        setMenuPath(null);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <header className="topbar" ref={headerRef}>
      <div className="topbar-inner">
        <Brand />

        <nav className="main-nav" aria-label="Primary">
          <NavLinks />
        </nav>

        <div className="topbar-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Switch to ${nextTheme} theme`}
            title={`Switch to ${nextTheme} theme`}
            onClick={() => updateSettings({ theme: nextTheme })}
          >
            {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="wallet-wrap">
            <ConnectButton
              label="Connect wallet"
              chainStatus="icon"
              accountStatus="address"
              showBalance={false}
            />
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-btn menu-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuPath(menuOpen ? null : pathname)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <nav
        id="mobile-nav"
        className="mobile-nav"
        aria-label="Primary mobile"
        hidden={!menuOpen}
      >
        <NavLinks onNavigate={() => setMenuPath(null)} />
      </nav>
    </header>
  );
}
