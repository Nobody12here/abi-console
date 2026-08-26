import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Braces, Check, ChevronDown, Copy, Moon, Settings2, Share2, Sun, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/menu/Menu";
import type { Network } from "../types";

type HeaderProps = {
  network: Network;
  networks: Network[];
  networkOpen: boolean;
  wallet: boolean;
  walletOpen: boolean;
  dark: boolean;
  onToggleNetwork: () => void;
  onSelectNetwork: (network: Network) => void;
  onToggleTheme: () => void;
  onConnectWallet: () => void;
  onToggleWallet: () => void;
  onCopyWallet: () => void;
  onDisconnectWallet: () => void;
};

export function Header({
  network,
  networks,
  networkOpen,
  wallet,
  walletOpen,
  dark,
  onToggleNetwork,
  onSelectNetwork,
  onToggleTheme,
  onConnectWallet,
  onToggleWallet,
  onCopyWallet,
  onDisconnectWallet,
}: HeaderProps) {
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
          <div className="menu-wrap">
            <Button variant="outline" size="sm" onClick={onToggleNetwork}>
              <span className="network-dot" style={{ background: network.color }} />
              {network.name}
              <ChevronDown size={14} />
            </Button>
            {networkOpen && (
              <Menu>
                <p className="menu-label">NETWORK</p>
                {networks.map((item) => (
                  <button
                    key={item.id}
                    className="menu-item"
                    onClick={() => onSelectNetwork(item)}
                  >
                    <span className="network-dot" style={{ background: item.color }} />
                    {item.name}
                    {network.id === item.id && <Check size={14} className="menu-check" />}
                  </button>
                ))}
              </Menu>
            )}
          </div>
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
            {!wallet ? (
              <ConnectButton />
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={onToggleWallet}>
                  <span className="status-dot" />
                  0x91c...2a8d
                  <ChevronDown size={14} />
                </Button>
                {walletOpen && (
                  <Menu>
                    <button className="menu-item" onClick={onCopyWallet}>
                      <Copy size={14} />
                      Copy address
                    </button>
                    <button className="menu-item danger" onClick={onDisconnectWallet}>
                      <X size={14} />
                      Disconnect
                    </button>
                  </Menu>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
