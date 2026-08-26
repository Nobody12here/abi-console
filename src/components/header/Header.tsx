import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Braces, Moon, Settings2, Share2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
type HeaderProps = {
  dark: boolean;
  onToggleTheme: () => void;
};

export function Header({ dark, onToggleTheme }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="brand-mark">
            <Braces size={17} />
          </div>
          <span>
            ABI <i>/</i> Console
          </span>
          <span className="preview-tag">PREVIEW</span>
        </div>
        <div className="nav-actions">
          <Button variant="outline" size="icon" aria-label="Developer toolbox">
            <Settings2 size={16} />
          </Button>
          <Button variant="outline" size="icon" aria-label="Share workspace">
            <Share2 size={16} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Toggle theme"
            onClick={onToggleTheme}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <div className="menu-wrap">
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
