import { useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatEther, parseEther } from "viem";
import toast from "react-hot-toast";
import type { ThemeMode } from "@/features/abi/types";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { clearWorkspaceStorage } from "@/features/storage/workspace";
import { CHAINS, chainName, DEFAULT_CHAIN_ID } from "@/lib/chains";
import { testRpcUrl, validateRpcUrl } from "@/lib/rpc";
import { downloadText, plural, toJson } from "@/lib/format";
import { errorMessage } from "@/features/execution/errors";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageLoading } from "@/components/ui/PageLoading";

const THEMES: Array<{ id: ThemeMode; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("settings-section", className)}>
      <div className="settings-section-copy">
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

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
  const { ready } = useWorkspace();
  // Drafts are seeded from saved settings, so wait until those have loaded.
  return ready ? <SettingsForm /> : <PageLoading />;
}

function SettingsForm() {
  const {
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
  const [rpcChain, setRpcChain] = useState<number>(
    settings.lastChainId ?? DEFAULT_CHAIN_ID,
  );
  const [rpcUrl, setRpcUrl] = useState("");
  const [rpcTesting, setRpcTesting] = useState(false);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const overrides = Object.entries(settings.rpcOverrides)
    .map(([chainId, url]) => ({ chainId: Number(chainId), url }))
    .filter((entry) => entry.url);

  const saveKey = () => {
    updateSettings({ etherscanKey: keyDraft.trim() });
    toast.success(keyDraft.trim() ? "API key saved." : "API key removed.");
  };

  const saveThreshold = () => {
    const value = thresholdDraft.trim() || "0";
    if (!/^\d+(\.\d+)?$/.test(value)) {
      setThresholdError("Enter an amount like 0.05.");
      return;
    }
    try {
      const wei = parseEther(value);
      updateSettings({ confirmValueThresholdWei: wei.toString() });
      setThresholdError(null);
      setThresholdDraft(formatEther(wei));
      toast.success("Saved.");
    } catch (error) {
      setThresholdError(errorMessage(error));
    }
  };

  const saveRpc = async () => {
    const url = rpcUrl.trim();
    const validation = validateRpcUrl(url) ?? (url ? null : "Enter an RPC URL.");
    if (validation) {
      setRpcError(validation);
      return;
    }
    setRpcTesting(true);
    setRpcError(null);
    try {
      await testRpcUrl(url, rpcChain);
      updateSettings({
        rpcOverrides: { ...settings.rpcOverrides, [rpcChain]: url },
      });
      setRpcUrl("");
      toast.success(`Custom RPC saved for ${chainName(rpcChain)}.`);
    } catch (error) {
      setRpcError(errorMessage(error));
    } finally {
      setRpcTesting(false);
    }
  };

  const removeRpc = (chainId: number) => {
    const next = { ...settings.rpcOverrides };
    delete next[chainId];
    updateSettings({ rpcOverrides: next });
    toast.success(`${chainName(chainId)} uses its default RPC again.`);
  };

  const exportWorkspace = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(toJson(exportData()), `abiconsole-workspace-${stamp}.json`);
    toast.success("Exported. Your API key is not included.");
  };

  const importWorkspace = async (file: File) => {
    setImportError(null);
    if (file.size > 20_000_000) {
      setImportError("That file is larger than 20 MB.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const counts = importData(parsed);
      toast.success(
        `Imported ${plural(counts.bindings, "contract")} and ${plural(counts.txs, "transaction")}.`,
      );
    } catch (error) {
      setImportError(
        error instanceof SyntaxError
          ? "That file isn’t valid JSON."
          : errorMessage(error),
      );
    }
  };

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Settings"
        description="Everything here is stored in this browser only."
      />

      <Section title="Theme">
        <div className="segmented" role="group" aria-label="Theme">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={cn(settings.theme === theme.id && "selected")}
              aria-pressed={settings.theme === theme.id}
              onClick={() => updateSettings({ theme: theme.id })}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Etherscan API key"
        description={
          <>
            Optional. Only used to fetch ABIs of verified contracts. Get a free
            key from your{" "}
            <a
              className="text-link"
              href="https://etherscan.io/myapikey"
              target="_blank"
              rel="noreferrer"
            >
              Etherscan account
            </a>
            .
          </>
        }
      >
        <div className="inline-field">
          <div className="secret-field">
            <input
              className="field mono"
              type={showKey ? "text" : "password"}
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder="API key"
              spellCheck={false}
              autoComplete="off"
              aria-label="Etherscan API key"
            />
            <button
              type="button"
              className="icon-btn small"
              aria-label={showKey ? "Hide API key" : "Show API key"}
              onClick={() => setShowKey((value) => !value)}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <Button
            onClick={saveKey}
            disabled={keyDraft.trim() === settings.etherscanKey}
          >
            Save
          </Button>
        </div>
      </Section>

      <Section
        title="Custom RPC URLs"
        description="Each network uses a public RPC by default. Add your own for higher rate limits, archive data, or a local node on a different port."
      >
        {overrides.length > 0 && (
          <div className="table rpc-list">
            {overrides.map((entry) => (
              <div key={entry.chainId} className="rpc-row">
                <span>{chainName(entry.chainId)}</span>
                <span className="mono muted break">{entry.url}</span>
                <Button size="sm" variant="ghost" onClick={() => removeRpc(entry.chainId)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="rpc-form">
          <select
            className="field"
            value={rpcChain}
            onChange={(event) => {
              setRpcChain(Number(event.target.value));
              setRpcError(null);
            }}
            aria-label="Network"
          >
            {CHAINS.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
          <input
            className={cn("field mono", rpcError && "invalid")}
            value={rpcUrl}
            onChange={(event) => setRpcUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveRpc();
            }}
            placeholder={
              CHAINS.find((chain) => chain.id === rpcChain)?.rpcUrls.default.http[0] ??
              "https://…"
            }
            spellCheck={false}
            aria-label="RPC URL"
          />
          <Button loading={rpcTesting} onClick={() => void saveRpc()}>
            Test & save
          </Button>
        </div>
        {rpcError && <p className="field-error">{rpcError}</p>}
      </Section>

      <Section title="Transactions">
        <div className="setting-row">
          <div>
            <strong>Remember inputs</strong>
            <p className="muted">
              Refill each function’s inputs with the last values that worked.
            </p>
          </div>
          <Switch
            checked={settings.rememberArgs}
            onChange={(next) => updateSettings({ rememberArgs: next })}
            label="Remember inputs"
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Ask before sending value</strong>
            <p className="muted">
              Show a confirmation when a transaction sends more than this amount
              of the network’s native token. Use 0 to always ask.
            </p>
          </div>
          <div className="inline-field threshold-field">
            <input
              className={cn("field mono", thresholdError && "invalid")}
              value={thresholdDraft}
              onChange={(event) => setThresholdDraft(event.target.value)}
              inputMode="decimal"
              spellCheck={false}
              aria-label="Confirmation threshold"
            />
            <Button onClick={saveThreshold}>Save</Button>
          </div>
        </div>
        {thresholdError && <p className="field-error">{thresholdError}</p>}
      </Section>

      <Section
        title="Backup"
        description={`You have ${plural(bindings.length, "contract")}, ${plural(revisions.length, "ABI version")} and ${plural(txs.length, "transaction")} saved. Export them to a file, or import a file exported from another browser. Importing adds to what you have.`}
      >
        <div className="button-row">
          <Button onClick={exportWorkspace} disabled={bindings.length === 0}>
            Export
          </Button>
          <Button onClick={() => importRef.current?.click()}>Import</Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Import workspace file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importWorkspace(file);
            }}
          />
        </div>
        {importError && <p className="field-error">{importError}</p>}
      </Section>

      <Section
        title="Delete all data"
        description="Removes every saved contract, ABI, transaction and setting from this browser."
      >
        <div>
          <Button variant="danger" onClick={() => setClearOpen(true)}>
            Delete all data
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={clearOpen}
        title="Delete all data?"
        description="This can’t be undone. Export a backup first if you might need it."
        confirmLabel="Delete everything"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          resetWorkspace();
          void clearWorkspaceStorage();
          setClearOpen(false);
          setKeyDraft("");
          setRpcUrl("");
        }}
      />
    </div>
  );
}
