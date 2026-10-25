import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Loader2,
  Upload,
} from "lucide-react";
import { getAddress, isAddress } from "viem";
import type { AbiSource, ImportedAbi } from "@/features/abi/types";
import {
  AbiValidationError,
  normalizeAbi,
} from "@/features/abi/normalize";
import { proxyLabel } from "@/features/abi/utils";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import {
  CHAINS,
  chainName,
  DEFAULT_CHAIN_ID,
  explorerAbiSupported,
  getChain,
  isLocalChain,
} from "@/lib/chains";
import { createReadClient } from "@/lib/rpc";
import { inspectContract } from "@/lib/proxy";
import { fetchAbiFromUrl, fetchExplorerAbi } from "@/lib/explorer";
import { errorMessage } from "@/features/execution/errors";
import { plural, shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/Brand";
import { PageLoading } from "@/components/ui/PageLoading";

type SourceKind = "paste" | "file" | "url" | "explorer";

type Loaded = { imported: ImportedAbi; source: AbiSource };

const SOURCE_TABS: Array<{ id: SourceKind; label: string }> = [
  { id: "paste", label: "Paste JSON" },
  { id: "file", label: "Upload file" },
  { id: "url", label: "From URL" },
  { id: "explorer", label: "Etherscan" },
];

function parseSource(value: string | null): SourceKind {
  return value === "file" || value === "url" || value === "explorer"
    ? value
    : "paste";
}

function validationIssues(error: unknown): string[] {
  return error instanceof AbiValidationError
    ? error.issues
    : [errorMessage(error)];
}

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="status-line danger" role="alert">
      <AlertTriangle size={14} />
      <div>
        {issues.length === 1 ? (
          <span>{issues[0]}</span>
        ) : (
          <ul>
            {issues.slice(0, 5).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
            {issues.length > 5 && <li>…and {issues.length - 5} more</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function AbiSummary({ imported }: { imported: ImportedAbi }) {
  const { counts } = imported;
  return (
    <div className="status-line success" role="status">
      <Check size={14} />
      <span>
        Valid ABI: {plural(counts.functions, "function")} ({counts.readFunctions}{" "}
        read, {counts.writeFunctions} write), {plural(counts.events, "event")}
        {imported.warnings.length > 0 &&
          ` · ${plural(imported.warnings.length, "note")} (see the ABI tab)`}
      </span>
    </div>
  );
}

const isTestOrLocal = (chain: (typeof CHAINS)[number]) =>
  Boolean(chain.testnet) || isLocalChain(chain.id);
const mainnets = CHAINS.filter((chain) => !isTestOrLocal(chain));
const testnets = CHAINS.filter(isTestOrLocal);

export function ImportPage() {
  const { ready } = useWorkspace();
  // The default network comes from saved settings, so wait until they load.
  return ready ? <ImportForm /> : <PageLoading />;
}

function ImportForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { chainId: walletChainId } = useAccount();
  const {
    settings,
    bindings,
    createRevision,
    saveContract,
    updateSettings,
  } = useWorkspace();

  const [sourceKind, setSourceKind] = useState<SourceKind>(() =>
    parseSource(params.get("source")),
  );
  const [loaded, setLoaded] = useState<Partial<Record<SourceKind, Loaded>>>({});
  const [issues, setIssues] = useState<Partial<Record<SourceKind, string[]>>>({});
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState("");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Only accept a chain from the link if this app supports it.
  const [chainId, setChainId] = useState(() => {
    const fromParams = Number(params.get("chainId"));
    if (getChain(fromParams)) return fromParams;
    if (getChain(walletChainId)) return walletChainId!;
    if (getChain(settings.lastChainId)) return settings.lastChainId!;
    return DEFAULT_CHAIN_ID;
  });
  const [address, setAddress] = useState(params.get("address") ?? "");
  const [name, setName] = useState("");

  const trimmedAddress = address.trim();
  const addressValid = isAddress(trimmedAddress);
  const normalizedAddress = addressValid ? getAddress(trimmedAddress) : undefined;
  const existing = normalizedAddress
    ? bindings.find(
        (binding) =>
          binding.chainId === chainId && binding.address === normalizedAddress,
      )
    : undefined;

  // Pasted JSON is validated as you type, so there is no separate "load" step.
  const deferredPaste = useDeferredValue(paste);
  const pasteResult = useMemo<
    { loaded?: Loaded; issues: string[] } | undefined
  >(() => {
    if (!deferredPaste.trim()) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(deferredPaste);
    } catch {
      return { issues: ["This is not valid JSON yet."] };
    }
    try {
      return {
        loaded: { imported: normalizeAbi(parsed), source: { kind: "paste" } },
        issues: [],
      };
    } catch (error) {
      return { issues: validationIssues(error) };
    }
  }, [deferredPaste]);

  const current: Loaded | undefined =
    sourceKind === "paste" ? pasteResult?.loaded : loaded[sourceKind];
  const currentIssues =
    sourceKind === "paste" ? (pasteResult?.issues ?? []) : (issues[sourceKind] ?? []);

  const codeQuery = useQuery({
    queryKey: [
      "inspect-contract",
      chainId,
      normalizedAddress,
      settings.rpcOverrides[chainId] ?? "",
    ],
    enabled: Boolean(normalizedAddress),
    queryFn: async () => {
      const client = createReadClient(chainId, settings.rpcOverrides);
      return inspectContract(client, normalizedAddress!, chainId);
    },
    retry: 1,
  });
  const noCode = codeQuery.data?.codeSize === 0;

  const setKindIssues = (kind: SourceKind, next: string[]) =>
    setIssues((value) => ({ ...value, [kind]: next }));

  const accept = (kind: SourceKind, value: unknown, source: AbiSource) => {
    try {
      const imported = normalizeAbi(value);
      setLoaded((entries) => ({ ...entries, [kind]: { imported, source } }));
      setKindIssues(kind, []);
    } catch (error) {
      setLoaded((entries) => ({ ...entries, [kind]: undefined }));
      setKindIssues(kind, validationIssues(error));
    }
  };

  const readFile = async (file: File) => {
    if (file.size > 5_000_000) {
      setKindIssues("file", ["That file is larger than 5 MB."]);
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      accept("file", parsed, {
        kind: "file",
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (error) {
      setLoaded((entries) => ({ ...entries, file: undefined }));
      setKindIssues("file", [
        error instanceof SyntaxError
          ? "That file does not contain valid JSON."
          : errorMessage(error),
      ]);
    } finally {
      setBusy(false);
    }
  };

  const loadUrl = async () => {
    const target = url.trim();
    if (!target) {
      setKindIssues("url", ["Enter a URL that returns ABI JSON."]);
      return;
    }
    setBusy(true);
    setKindIssues("url", []);
    try {
      const result = await fetchAbiFromUrl(target);
      accept("url", result, { kind: "url", url: target });
    } catch (error) {
      setLoaded((entries) => ({ ...entries, url: undefined }));
      setKindIssues("url", [errorMessage(error)]);
    } finally {
      setBusy(false);
    }
  };

  const loadExplorer = async () => {
    if (!normalizedAddress) return;
    setBusy(true);
    setKindIssues("explorer", []);
    try {
      const result = await fetchExplorerAbi(
        chainId,
        normalizedAddress,
        settings.etherscanKey,
      );
      accept("explorer", result, {
        kind: "explorer",
        provider: "etherscan",
        verified: true,
      });
    } catch (error) {
      setLoaded((entries) => ({ ...entries, explorer: undefined }));
      setKindIssues("explorer", [errorMessage(error)]);
    } finally {
      setBusy(false);
    }
  };

  const suggestedName =
    existing?.name ??
    (current?.source.kind === "file"
      ? current.source.fileName.replace(/\.json$/i, "")
      : "");

  const canSave = Boolean(
    current &&
      normalizedAddress &&
      !busy &&
      !codeQuery.isLoading &&
      !noCode,
  );

  const save = () => {
    if (!current || !normalizedAddress) return;
    try {
      const revision = createRevision(current.imported, current.source);
      const binding = saveContract({
        name: name.trim() || suggestedName,
        chainId,
        address: normalizedAddress,
        revisionId: revision.id,
        codeInfo: codeQuery.data,
      });
      updateSettings({ lastChainId: chainId });
      toast.success(existing ? "ABI updated." : "Contract added.");
      navigate(`/contract/${binding.chainId}/${binding.address}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const codeStatus = (() => {
    if (!trimmedAddress) return null;
    if (!addressValid) {
      return (
        <p className="status-line danger">
          <CircleAlert size={14} /> Not a valid address.
        </p>
      );
    }
    if (codeQuery.isLoading) {
      return (
        <p className="status-line muted">
          <Loader2 size={14} className="spin" /> Checking {chainName(chainId)}…
        </p>
      );
    }
    if (codeQuery.isError) {
      return (
        <p className="status-line warning">
          <AlertTriangle size={14} /> Couldn’t reach {chainName(chainId)} to
          check this address. You can still save it.
        </p>
      );
    }
    if (noCode) {
      return (
        <p className="status-line danger">
          <CircleAlert size={14} /> No contract at this address on{" "}
          {chainName(chainId)}. Check the network.
        </p>
      );
    }
    const proxy = codeQuery.data?.proxy;
    return (
      <p className="status-line success">
        <Check size={14} /> Contract found
        {proxy && (
          <>
            {" "}· {proxyLabel(proxy)}
            {"implementation" in proxy && proxy.implementation && (
              <>
                , implementation{" "}
                <span className="mono">{shortenAddress(proxy.implementation)}</span>
                . Use the implementation’s ABI.
              </>
            )}
          </>
        )}
      </p>
    );
  })();

  const explorerKeyMissing = !settings.etherscanKey.trim();

  return (
    <div className="page page-narrow">
      <PageHeader
        title={existing ? "Update contract ABI" : "Add contract"}
        description="Enter where the contract is deployed, then provide its ABI."
      />

      <div className="form-card">
        <div className="form-row two">
          <label className="field-group">
            <span className="field-label">Network</span>
            <select
              className="field"
              value={chainId}
              onChange={(event) => setChainId(Number(event.target.value))}
            >
              <optgroup label="Mainnets">
                {mainnets.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Testnets & local">
                {testnets.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="field-group">
            <span className="field-label">Contract address</span>
            <input
              className={cn("field mono", trimmedAddress && !addressValid && "invalid")}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        </div>
        {codeStatus}

        {existing && (
          <div className="notice info">
            <div>
              <strong>{existing.name} is already saved.</strong>{" "}
              Saving again replaces its ABI; the old one stays in its ABI
              history.{" "}
              <Link
                className="text-link"
                to={`/contract/${existing.chainId}/${existing.address}`}
              >
                Open it
              </Link>
            </div>
          </div>
        )}

        <div className="form-section">
          <span className="field-label">ABI</span>
          <div className="segmented" role="tablist" aria-label="ABI source">
            {SOURCE_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={sourceKind === id}
                className={cn(sourceKind === id && "selected")}
                onClick={() => setSourceKind(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {sourceKind === "paste" && (
            <textarea
              className="field mono textarea"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder={'[{"type":"function","name":"balanceOf", …}]\n\nA bare ABI array or a full Foundry/Hardhat artifact both work.'}
              spellCheck={false}
              aria-label="ABI JSON"
            />
          )}

          {sourceKind === "file" && (
            <div
              className={cn("drop-zone", dragging && "dragging")}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                // Ignore leave events fired when moving over child elements.
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setDragging(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void readFile(file);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                tabIndex={-1}
                aria-label="ABI or artifact JSON file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void readFile(file);
                }}
              />
              <Upload size={18} className="muted" />
              <p>
                {fileName ? (
                  <strong className="mono">{fileName}</strong>
                ) : (
                  "Drop a JSON file here, or"
                )}
              </p>
              <Button
                size="sm"
                loading={busy}
                onClick={() => fileRef.current?.click()}
              >
                {fileName ? "Choose another file" : "Choose file"}
              </Button>
              <small className="muted">
                Foundry <code>out/</code>, Hardhat <code>artifacts/</code>, or a
                plain ABI array
              </small>
            </div>
          )}

          {sourceKind === "url" && (
            <div className="inline-field">
              <input
                className="field mono"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadUrl();
                }}
                placeholder="https://example.com/MyContract.json"
                spellCheck={false}
                aria-label="ABI URL"
              />
              <Button loading={busy} onClick={() => void loadUrl()}>
                Load
              </Button>
            </div>
          )}

          {sourceKind === "explorer" && (
            <div className="explorer-source">
              <p className="muted">
                Fetches the ABI of a contract that is verified on Etherscan.
              </p>
              {explorerKeyMissing ? (
                <p className="status-line warning">
                  <AlertTriangle size={14} />
                  <span>
                    Needs an Etherscan API key.{" "}
                    <Link to="/settings" className="text-link">
                      Add one in Settings
                    </Link>
                  </span>
                </p>
              ) : !explorerAbiSupported(chainId) ? (
                <p className="status-line warning">
                  <AlertTriangle size={14} /> Etherscan isn’t available for{" "}
                  {chainName(chainId)}.
                </p>
              ) : (
                <Button
                  loading={busy}
                  disabled={!normalizedAddress}
                  onClick={() => void loadExplorer()}
                >
                  {normalizedAddress
                    ? `Fetch ABI for ${shortenAddress(normalizedAddress)}`
                    : "Enter an address above first"}
                </Button>
              )}
            </div>
          )}

          <IssueList issues={currentIssues} />
          {current && <AbiSummary imported={current.imported} />}
        </div>

        <label className="field-group form-section">
          <span className="field-label">
            Name <span className="muted">(optional)</span>
          </span>
          <input
            className="field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={suggestedName || "e.g. Token, Vault"}
          />
        </label>

        <div className="form-actions">
          <Button variant="primary" disabled={!canSave} onClick={save}>
            {existing ? "Save ABI" : "Add contract"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            Cancel
          </Button>
          {!canSave && (
            <span className="muted form-hint">
              {!normalizedAddress
                ? "Enter a contract address."
                : !current
                  ? "Provide an ABI."
                  : noCode
                    ? "No contract at this address."
                    : codeQuery.isLoading
                      ? "Checking the address…"
                      : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
