import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Monitor,
  Moon,
  Network,
  RefreshCw,
  Save,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { formatEther, parseEther } from "viem";
import toast from "react-hot-toast";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { clearWorkspaceStorage } from "@/features/storage/workspace";
import { CHAINS, chainName } from "@/lib/chains";
import { testRpcUrl, validateRpcUrl } from "@/lib/rpc";
import { downloadText, plural, toJson } from "@/lib/format";
import { errorMessage } from "@/features/execution/errors";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/Brand";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { Spinner } from "@/components/ui/Spinner";

type RpcStatus =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; message: string }
  | { state: "error"; message: string };

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn("switch", checked && "is-on")}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function SettingsPage() {
  const {
    ready,
    settings,
    bindings,
    revisions,
    txs,
    updateSettings,
    exportData,
    importData,
    resetWorkspace,
  } = useWorkspace();

  const [keyDraft, setKeyDraft] = useState(settings.etherscanKey);
  const [showKey, setShowKey] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState(() => {
    try {
      return formatEther(BigInt(settings.confirmValueThresholdWei || "0"));
    } catch {
      return "0";
    }
  });
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [rpcDrafts, setRpcDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      Object.entries(settings.rpcOverrides).map(([chainId, url]) => [
        Number(chainId),
        url,
      ]),
    ),
  );
  const [rpcStatus, setRpcStatus] = useState<Record<number, RpcStatus>>({});
  const [importError, setImportError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearWord, setClearWord] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  if (!ready) {
    return (
      <div className="page-loading">
        <Spinner label="Loading workspace" />
        <span>Loading local workspace…</span>
      </div>
    );
  }

  const saveKey = () => {
    updateSettings({ etherscanKey: keyDraft.trim() });
    toast.success(
      keyDraft.trim()
        ? "Etherscan key saved in this browser."
        : "Etherscan key removed.",
    );
  };

  const saveThreshold = () => {
    try {
      const value = thresholdDraft.trim() || "0";
      if (!/^\d+(\.\d+)?$/.test(value)) {
        throw new Error("Enter a non-negative native amount, for example 0.05.");
      }
      const wei = parseEther(value);
      updateSettings({ confirmValueThresholdWei: wei.toString() });
      setThresholdError(null);
      setThresholdDraft(formatEther(wei));
      toast.success("Confirmation threshold saved.");
    } catch (error) {
      setThresholdError(errorMessage(error));
    }
  };

  const saveRpc = async (chainId: number) => {
    const url = (rpcDrafts[chainId] ?? "").trim();
    if (!url) {
      const next = { ...settings.rpcOverrides };
      delete next[chainId];
      updateSettings({ rpcOverrides: next });
      setRpcStatus((current) => ({ ...current, [chainId]: { state: "idle" } }));
      toast.success(`Using the default RPC for ${chainName(chainId)}.`);
      return;
    }

    const validation = validateRpcUrl(url);
    if (validation) {
      setRpcStatus((current) => ({
        ...current,
        [chainId]: { state: "error", message: validation },
      }));
      return;
    }

    setRpcStatus((current) => ({
      ...current,
      [chainId]: { state: "testing" },
    }));
    try {
      await testRpcUrl(url, chainId);
      updateSettings({
        rpcOverrides: { ...settings.rpcOverrides, [chainId]: url },
      });
      setRpcStatus((current) => ({
        ...current,
        [chainId]: {
          state: "ok",
          message: `eth_chainId returned ${chainId}.`,
        },
      }));
      toast.success(`RPC saved for ${chainName(chainId)}.`);
    } catch (error) {
      setRpcStatus((current) => ({
        ...current,
        [chainId]: { state: "error", message: errorMessage(error) },
      }));
    }
  };

  const clearRpc = (chainId: number) => {
    const next = { ...settings.rpcOverrides };
    delete next[chainId];
    updateSettings({ rpcOverrides: next });
    setRpcDrafts((current) => ({ ...current, [chainId]: "" }));
    setRpcStatus((current) => ({ ...current, [chainId]: { state: "idle" } }));
    toast.success(`Removed the RPC override for ${chainName(chainId)}.`);
  };

  const exportWorkspace = () => {
    const bundle = exportData();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(
      toJson(bundle),
      `abiconsole-workspace-${stamp}.json`,
    );
    toast.success("Workspace exported. API keys are not included.");
  };

  const importWorkspace = async (file: File) => {
    setImportError(null);
    if (file.size > 20_000_000) {
      setImportError("That bundle is larger than 20 MB.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const counts = importData(parsed);
      toast.success(
        `Imported ${plural(counts.bindings, "contract")}, ${plural(counts.revisions, "ABI revision")}, and ${plural(counts.txs, "transaction")}.`,
      );
    } catch (error) {
      setImportError(errorMessage(error));
    }
  };

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="LOCAL WORKSPACE"
        title="Settings"
        description="Keys, RPCs, and contract data stay in this browser. Nothing is synced to a server."
      />

      <div className="settings-layout">
        <section className="settings-section">
          <div className="settings-heading">
            <span className="settings-icon">
              <Sun size={16} />
            </span>
            <div>
              <p className="eyebrow">APPEARANCE</p>
              <h2>Theme</h2>
            </div>
          </div>
          <div className="theme-options" role="group" aria-label="Theme">
            {(
              [
                { id: "dark", label: "Dark", icon: Moon },
                { id: "light", label: "Light", icon: Sun },
                { id: "system", label: "System", icon: Monitor },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={cn("theme-option", settings.theme === id && "selected")}
                aria-pressed={settings.theme === id}
                onClick={() => updateSettings({ theme: id })}
              >
                <Icon size={16} />
                <strong>{label}</strong>
                <span>
                  {id === "dark"
                    ? "Ink-black surfaces"
                    : id === "light"
                      ? "Paper surfaces"
                      : "Follow the OS"}
                </span>
                {settings.theme === id && <Check size={14} />}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-heading">
            <span className="settings-icon">
              <KeyRound size={16} />
            </span>
            <div>
              <p className="eyebrow">ONLINE SOURCES</p>
              <h2>Etherscan API key</h2>
            </div>
            <Badge tone="teal">BYOK</Badge>
          </div>
          <p className="settings-copy">
            Optional. Explorer lookup is the only feature that uses this key. It
            is sent directly to Etherscan from your browser and is never included
            in exports. The primary file, paste, and URL imports do not need it.
          </p>
          <div className="secret-row">
            <div className="secret-field">
              <input
                className="field mono"
                type={showKey ? "text" : "password"}
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder="Your Etherscan API key"
                spellCheck={false}
                autoComplete="off"
                aria-label="Etherscan API key"
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={showKey ? "Hide API key" : "Show API key"}
                title={showKey ? "Hide key" : "Show key"}
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button variant="secondary" icon={<Save size={14} />} onClick={saveKey}>
              Save key
            </Button>
            {settings.etherscanKey && (
              <Button
                variant="ghost"
                onClick={() => {
                  setKeyDraft("");
                  updateSettings({ etherscanKey: "" });
                  toast.success("Etherscan key removed.");
                }}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="hint">
            <ShieldCheck size={13} /> Stored locally with the rest of the
            workspace. Create a key in your Etherscan account settings.
          </p>
        </section>

        <section className="settings-section">
          <div className="settings-heading">
            <span className="settings-icon">
              <Network size={16} />
            </span>
            <div>
              <p className="eyebrow">EXECUTION</p>
              <h2>RPC overrides</h2>
            </div>
            <Badge tone="muted">{Object.keys(settings.rpcOverrides).length} set</Badge>
          </div>
          <p className="settings-copy">
            Every chain uses a public default RPC. Add your own HTTPS endpoint
            when you need archival reads, higher rate limits, or a local node.
            Each endpoint is tested with <code className="mono">eth_chainId</code>{" "}
            before it is saved.
          </p>

          <div className="rpc-list">
            {CHAINS.map((chain) => {
              const override = settings.rpcOverrides[chain.id];
              const draft = rpcDrafts[chain.id] ?? "";
              const status = rpcStatus[chain.id] ?? { state: "idle" };
              const defaultUrl = chain.rpcUrls.default.http[0];
              return (
                <div key={chain.id} className="rpc-row">
                  <div className="rpc-chain">
                    <ChainBadge chainId={chain.id} />
                    <span className="mono rpc-chain-id">{chain.id}</span>
                    {override ? (
                      <Badge tone="teal">Override</Badge>
                    ) : (
                      <Badge tone="muted">Default</Badge>
                    )}
                  </div>
                  <div className="rpc-field">
                    <input
                      className="field mono"
                      value={draft}
                      onChange={(event) =>
                        setRpcDrafts((current) => ({
                          ...current,
                          [chain.id]: event.target.value,
                        }))
                      }
                      placeholder={defaultUrl}
                      spellCheck={false}
                      aria-label={`RPC URL for ${chainName(chain.id)}`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<RefreshCw size={13} />}
                      loading={status.state === "testing"}
                      onClick={() => void saveRpc(chain.id)}
                    >
                      Test &amp; save
                    </Button>
                    {override && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => clearRpc(chain.id)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {status.state === "error" && (
                    <p className="field-error rpc-status">{status.message}</p>
                  )}
                  {status.state === "ok" && (
                    <p className="hint rpc-status success-text">{status.message}</p>
                  )}
                  {status.state === "idle" && (
                    <p className="hint rpc-status">
                      Default: <span className="mono">{defaultUrl}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="settings-disabled">
            <div>
              <strong>Add a custom chain</strong>
              <p>
                Custom chains require rebuilding the wallet connection registry.
                They are intentionally deferred; use an RPC override on a
                supported chain for now.
              </p>
            </div>
            <Badge tone="muted">Later</Badge>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-heading">
            <span className="settings-icon">
              <Database size={16} />
            </span>
            <div>
              <p className="eyebrow">BEHAVIOUR</p>
              <h2>Input and confirmation</h2>
            </div>
          </div>

          <div className="settings-toggle-row">
            <div>
              <strong>Remember last successful arguments</strong>
              <p>
                Stores the arguments that produced a successful read or
                simulation, per contract signature, in this browser.
              </p>
            </div>
            <Switch
              checked={settings.rememberArgs}
              onChange={(next) => updateSettings({ rememberArgs: next })}
              label="Remember last successful arguments"
            />
          </div>

          <div className="settings-inline-form">
            <label className="field-group">
              <span className="field-label">Confirm writes above</span>
              <div className="inline-field">
                <input
                  className={cn("field mono", thresholdError && "invalid")}
                  value={thresholdDraft}
                  onChange={(event) => setThresholdDraft(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                />
                <Button variant="secondary" onClick={saveThreshold}>
                  Save
                </Button>
              </div>
              <small>
                Native units. <code className="mono">0</code> asks for explicit
                confirmation whenever a payable value is above zero.
              </small>
            </label>
            {thresholdError && <p className="field-error">{thresholdError}</p>}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-heading">
            <span className="settings-icon">
              <Database size={16} />
            </span>
            <div>
              <p className="eyebrow">PORTABILITY</p>
              <h2>Workspace data</h2>
            </div>
          </div>
          <p className="settings-copy">
            Export a versioned bundle with contracts, ABI revisions, settings,
            and transaction history. API keys are never included. Import merges
            new records and leaves existing ones intact.
          </p>

          <div className="data-stats">
            <div>
              <strong>{bindings.length}</strong>
              <span>{bindings.length === 1 ? "Contract" : "Contracts"}</span>
            </div>
            <div>
              <strong>{revisions.length}</strong>
              <span>
                {revisions.length === 1 ? "ABI revision" : "ABI revisions"}
              </span>
            </div>
            <div>
              <strong>{txs.length}</strong>
              <span>{txs.length === 1 ? "Transaction" : "Transactions"}</span>
            </div>
          </div>

          <div className="settings-actions">
            <Button
              variant="secondary"
              icon={<Download size={14} />}
              onClick={exportWorkspace}
            >
              Export bundle
            </Button>
            <Button
              variant="secondary"
              icon={<Upload size={14} />}
              onClick={() => importRef.current?.click()}
            >
              Import bundle
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              tabIndex={-1}
              aria-label="Import workspace bundle"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importWorkspace(file);
              }}
            />
          </div>
          {importError && (
            <div className="tx-note danger" role="alert">
              <AlertTriangle size={14} /> {importError}
            </div>
          )}
        </section>

        <section className="settings-section danger-zone">
          <div className="settings-heading">
            <span className="settings-icon danger">
              <Trash2 size={16} />
            </span>
            <div>
              <p className="eyebrow">DESTRUCTIVE</p>
              <h2>Clear local workspace</h2>
            </div>
          </div>
          <p className="settings-copy">
            Removes every contract, ABI revision, transaction record, RPC
            override, and the Etherscan key from this browser. Exported bundles
            are not affected. This cannot be undone.
          </p>
          <div className="danger-action">
            <input
              className="field"
              value={clearWord}
              onChange={(event) => setClearWord(event.target.value)}
              placeholder='Type "DELETE" to enable'
              aria-label="Type DELETE to confirm clearing the workspace"
              spellCheck={false}
            />
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              disabled={clearWord !== "DELETE"}
              onClick={() => setClearOpen(true)}
            >
              Clear workspace
            </Button>
          </div>
        </section>

        <section className="settings-section about-section">
          <div className="settings-heading">
            <span className="settings-icon">
              <ShieldCheck size={16} />
            </span>
            <div>
              <p className="eyebrow">ABOUT</p>
              <h2>ABI Console</h2>
            </div>
            <Badge tone="muted">v0.1.0</Badge>
          </div>
          <p className="settings-copy">
            A local-first workbench for calling any EVM contract with an ABI you
            already have. Built with React, Vite, TypeScript, wagmi, viem, and
            RainbowKit. No analytics, no hosted ABI registry, no private keys.
          </p>
          <div className="about-grid">
            <div>
              <span>Storage</span>
              <strong>IndexedDB · localStorage fallback</strong>
            </div>
            <div>
              <span>Chains</span>
              <strong>{CHAINS.length} configured</strong>
            </div>
            <div>
              <span>Explorer</span>
              <strong>Bring your own key</strong>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={clearOpen}
        title="Clear the entire local workspace?"
        description="Every contract binding, ABI revision, transaction record, RPC override, and the Etherscan key will be deleted from this browser. Export a bundle first if you need a copy."
        confirmLabel="Delete everything"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          resetWorkspace();
          void clearWorkspaceStorage();
          setClearWord("");
          setClearOpen(false);
          setKeyDraft("");
          setRpcDrafts({});
          toast.success("Local workspace cleared.");
        }}
      />
    </div>
  );
}
