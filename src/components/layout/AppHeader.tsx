import { useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Menu, Moon, Settings2, Sun, X } from "lucide-react";
import { Brand } from "./Brand";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const { resolvedTheme, updateSettings } = useWorkspace();
  const { pathname } = useLocation();
  // Storing the path the menu was opened on closes it automatically on navigation.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const closeMenu = () => setMenuPath(null);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
          <NavLink
            to="/"
            end
            className={({ isActive }) => cn("nav-link", isActive && "active")}
          >
            Contracts
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => cn("nav-link", isActive && "active")}
          >
            Settings
          </NavLink>
        </nav>

        <div className="topbar-actions">
          <Link to="/import" className="btn btn-primary btn-sm topbar-import">
            Import contract
          </Link>
          <Link
            to="/settings"
            className="icon-btn settings-shortcut"
            aria-label="Settings"
            title="Settings"
          >
            <Settings2 size={16} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
            onClick={() =>
              updateSettings({
                theme: resolvedTheme === "dark" ? "light" : "dark",
              })
            }
          >
            {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="wallet-wrap">
            <ConnectButton
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
        className={cn("mobile-nav", menuOpen && "is-open")}
        aria-label="Primary mobile"
        hidden={!menuOpen}
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) => cn("nav-link", isActive && "active")}
          onClick={closeMenu}
        >
          Contracts
        </NavLink>
        <NavLink
          to="/import"
          className={({ isActive }) => cn("nav-link", isActive && "active")}
          onClick={closeMenu}
        >
          Import contract
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => cn("nav-link", isActive && "active")}
          onClick={closeMenu}
        >
          Settings
        </NavLink>
      </nav>
    </header>
  );
}
