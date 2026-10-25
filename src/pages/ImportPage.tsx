import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  CircleHelp,
  FileJson2,
  FolderInput,
  Globe2,
  Hash,
  KeyRound,
  Link2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { getAddress, isAddress } from "viem";
import type { AbiSource } from "@/features/abi/types";
import {
  AbiValidationError,
  normalizeAbi,
} from "@/features/abi/normalize";
import type { ImportedAbi } from "@/features/abi/types";
import { sourceLabel } from "@/features/abi/source";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { CHAINS, chainName, DEFAULT_CHAIN_ID, explorerAbiSupported } from "@/lib/chains";
import { createReadClient } from "@/lib/rpc";
import { inspectContract } from "@/lib/proxy";
import { fetchAbiFromUrl, fetchExplorerAbi } from "@/lib/explorer";
import { errorMessage } from "@/features/execution/errors";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { PageHeader } from "@/components/layout/Brand";
import { CopyButton } from "@/components/ui/CopyButton";

type SourceKind = "file" | "paste" | "url" | "explorer";

const SOURCE_TABS: Array<{
  id: SourceKind;
  label: string;
  icon: typeof FileJson2;
}> = [
  { id: "file", label: "File", icon: FolderInput },
  { id: "paste", label: "Paste", icon: FileJson2 },
  { id: "url", label: "URL", icon: Link2 },
  { id: "explorer", label: "Explorer", icon: Globe2 },
];

function parseSource(value: string | null): SourceKind {
  return value === "paste" || value === "url" || value === "explorer"
    ? value
    : "file";
}

function IssueList({ issues }: { issues: string[] }) {
  return (
    <div className="issue-box" role="alert">
      <span className="issue-icon">
        <AlertTriangle size={16} />
      </span>
      <div>
        <strong>{issues.length === 1 ? "Check the ABI" : `${issues.length} ABI issues`}</strong>
        <ul>
          {issues.slice(0, 5).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        {issues.length > 5 && (
          <small>{issues.length - 5} more issues not shown.</small>
        )}
      </div>
    </div>
  );
}

export function ImportPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { address: walletAddress, chainId: walletChainId } = useAccount();
  const {
    settings,
    bindings,
    revisionFor,
    createRevision,
    saveContract,
    updateSettings,
  } = useWorkspace();

  const [sourceKind, setSourceKind] = useState<SourceKind>(() =>
    parseSource(params.get("source")),
  );
  const [imported, setImported] = useState<ImportedAbi | null>(null);
  const [abiSource, setAbiSource] = useState<AbiSource | null>(null);
  const [sourceError, setSourceError] = useState<string[]>([]);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState("");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const initialChain =
    Number(params.get("chainId")) ||
    (walletChainId && CHAINS.some((chain) => chain.id === walletChainId)
      ? walletChainId
      : settings.lastChainId) ||
    DEFAULT_CHAIN_ID;

  const [address, setAddress] = useState(params.get("address") ?? "");
  const [chainId, setChainId] = useState(initialChain);
  const [name, setName] = useState("");

  const urlPreview = useMemo(() => {
    const raw = url.trim();
    if (!raw) return null;
    try {
      const parsed = new URL(raw);
      const isLocal =
        parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      return {
        invalid: false as const,
        origin: parsed.origin,
        path: `${parsed.pathname}${parsed.search}`,
        secure:
          parsed.protocol === "https:" ||
          (parsed.protocol === "http:" && isLocal),
      };
    } catch {
      return { invalid: true as const };
    }
  }, [url]);


  const addressValid = isAddress(address);
  const normalizedAddress = addressValid ? getAddress(address) : undefined;
  const existing = useMemo(() => {
    if (!normalizedAddress) return undefined;
    return bindings.find(
      (binding) =>
        binding.chainId === chainId && binding.address === normalizedAddress,
    );
  }, [bindings, chainId, normalizedAddress]);
  const existingRevision = revisionFor(existing);

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

  const acceptAbi = (
    value: unknown,
    source: AbiSource,
    successMessage = "ABI loaded and validated.",
  ) => {
    try {
      const result = normalizeAbi(value);
      setImported(result);
      setAbiSource(source);
      setSourceError([]);
      toast.success(successMessage);
    } catch (error) {
      if (error instanceof AbiValidationError) {
        setSourceError(error.issues);
      } else {
        setSourceError([errorMessage(error)]);
      }
      toast.error("That ABI could not be loaded. Existing input was kept.");
    }
  };

  const readFile = async (file: File) => {
    if (file.size > 5_000_000) {
      setSourceError(["That file is larger than 5 MB."]);
      return;
    }
    setSourceBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      setFileName(file.name);
      acceptAbi(
        parsed,
        { kind: "file", fileName: file.name, fileSize: file.size },
        `${file.name} loaded.`,
      );
    } catch (error) {
      setSourceError([
        error instanceof SyntaxError
          ? "That file does not contain valid JSON."
          : errorMessage(error),
      ]);
      toast.error("Could not read that file.");
    } finally {
      setSourceBusy(false);
    }
  };

  const handlePaste = () => {
    if (!paste.trim()) {
      setSourceError(["Paste an ABI JSON array or artifact first."]);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(paste);
    } catch {
      setSourceError(["That is not valid JSON. Check for missing braces or commas."]);
      return;
    }
    acceptAbi(parsed, { kind: "paste" }, "Pasted ABI loaded.");
  };

  const handleUrl = async () => {
    if (!url.trim()) {
      setSourceError(["Enter a URL that returns ABI JSON."]);
      return;
    }
    setSourceBusy(true);
    setSourceError([]);
    try {
      const result = await fetchAbiFromUrl(url);
      acceptAbi(result, { kind: "url", url: url.trim() }, "ABI fetched from URL.");
    } catch (error) {
      setSourceError([errorMessage(error)]);
      toast.error("Could not fetch that ABI.");
    } finally {
      setSourceBusy(false);
    }
  };

  const handleExplorer = async () => {
    if (!normalizedAddress) {
      setSourceError(["Enter a valid contract address in the binding panel first."]);
      return;
    }
    if (!settings.etherscanKey.trim()) {
      setSourceError([
        "Add your Etherscan API key in Settings, or use a file, paste, or URL instead.",
      ]);
      return;
    }
    setSourceBusy(true);
    setSourceError([]);
    try {
      const result = await fetchExplorerAbi(
        chainId,
        normalizedAddress,
        settings.etherscanKey,
      );
      acceptAbi(
        result,
        { kind: "explorer", provider: "etherscan", verified: true },
        "Verified ABI loaded from Etherscan.",
      );
    } catch (error) {
      setSourceError([errorMessage(error)]);
      toast.error("Explorer lookup failed.");
    } finally {
      setSourceBusy(false);
    }
  };

  const canOpen = Boolean(
    imported &&
      normalizedAddress &&
      !sourceBusy &&
      !codeQuery.isLoading &&
      (codeQuery.isError || (codeQuery.data?.codeSize ?? 0) > 0),
  );

  const openWorkspace = (saveOnly = false) => {
    if (!imported || !normalizedAddress || !abiSource) {
      toast.error("Load an ABI and enter a valid address first.");
      return;
    }
    if (codeQuery.data && codeQuery.data.codeSize === 0) {
      toast.error("There is no contract code at that address on this chain.");
      return;
    }

    try {
      const revision = createRevision(imported, abiSource);
      const binding = saveContract({
        name: name.trim() || existing?.name || "",
        chainId,
        address: normalizedAddress,
        revisionId: revision.id,
        codeInfo: codeQuery.data,
      });
      updateSettings({ lastChainId: chainId });
      if (saveOnly) {
        toast.success(`${binding.name} saved.`);
        navigate("/");
        return;
      }
      toast.success(
        existing ? "Contract ABI updated." : "Contract added to your workspace.",
      );
      navigate(`/contract/${binding.chainId}/${binding.address}/overview`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const abiSummary = imported ? (
    <div className="abi-summary">
      <div className="abi-summary-heading">
        <div>
          <p className="eyebrow">LOADED ABI</p>
          <h3>{abiSource ? sourceLabel(abiSource) : "ABI"}</h3>
        </div>
        <Badge tone="green">
          <Check size={12} /> Validated
        </Badge>
      </div>

      <dl className="abi-summary-grid">
        <div>
          <dt>ABI hash</dt>
          <dd className="mono">
            {shortHash(imported.hash, 10)}
            <CopyButton value={imported.hash} label="Copy ABI hash" compact />
          </dd>
        </div>
        <div>
          <dt>Functions</dt>
          <dd>
            {imported.counts.functions}
            <small>
              {imported.counts.readFunctions} read ·{" "}
              {imported.counts.writeFunctions} write
            </small>
          </dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>{imported.counts.events}</dd>
        </div>
        <div>
          <dt>Errors</dt>
          <dd>{imported.counts.errors}</dd>
        </div>
      </dl>

      {imported.warnings.length > 0 && (
        <div className="warning-list">
          <p className="eyebrow">NOTES</p>
          {imported.warnings.slice(0, 4).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className="abi-summary is-empty">
      <span className="abi-summary-empty-icon">
        <Braces size={20} />
      </span>
      <strong>No ABI loaded yet</strong>
      <p>
        Choose a source on the left. A bare array or an artifact with an{" "}
        <code>abi</code> field both work.
      </p>
    </div>
  );

  const codeStatus = (() => {
    if (!normalizedAddress) {
      return (
        <p className="check-line muted">
          <CircleHelp size={14} /> Enter an address to check for code.
        </p>
      );
    }
    if (codeQuery.isLoading) {
      return (
        <p className="check-line muted">
          <Loader2 size={14} className="spin" /> Checking code on{" "}
          {chainName(chainId)}…
        </p>
      );
    }
    if (codeQuery.isError) {
      return (
        <p className="check-line warning">
          <ShieldAlert size={14} /> Could not verify code:{" "}
          {errorMessage(codeQuery.error)}
        </p>
      );
    }
    if (codeQuery.data?.codeSize === 0) {
      return (
        <p className="check-line danger">
          <ShieldAlert size={14} /> No contract code at this address on{" "}
          {chainName(chainId)}.
        </p>
      );
    }
    return (
      <p className="check-line success">
        <ShieldCheck size={14} /> Contract code found
      </p>
    );
  })();

  return (
    <div className="page import-page">
      <PageHeader
        eyebrow="NEW WORKSPACE"
        title="Import a contract"
        description="Bind an ABI you already have to a deployed address. Explorer verification is optional, never required."
        actions={
          <Button
            variant="ghost"
            icon={<ArrowLeft size={15} />}
            onClick={() => navigate("/")}
          >
            Back to contracts
          </Button>
        }
      />

      <ol className="wizard-steps" aria-label="Import steps">
        <li className={cn(imported ? "done" : "active")}>
          <span>{imported ? <Check size={13} /> : "1"}</span>
          Load ABI
        </li>
        <li className={cn(imported ? "active" : "")}>
          <span>2</span>
          Bind address
        </li>
        <li>
          <span>3</span>
          Review & open
        </li>
      </ol>

      <div className="import-layout">
        <section className="panel import-source-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">STEP 01</p>
              <h2>Interface source</h2>
            </div>
            {imported && <Badge tone="teal">{imported.counts.functions} fns</Badge>}
          </div>

          <div className="segmented source-tabs" role="tablist" aria-label="ABI source">
            {SOURCE_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={sourceKind === id}
                className={cn(sourceKind === id && "selected")}
                onClick={() => {
                  setSourceKind(id);
                  setSourceError([]);
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {sourceKind === "file" && (
            <div
              className={cn("drop-zone", dragging && "dragging")}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
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
              <span className="drop-zone-icon">
                <Upload size={20} />
              </span>
              <strong>
                {fileName || "Drop a Foundry, Hardhat, or ABI JSON file"}
              </strong>
              <p>
                The whole artifact or a bare array works. Nothing is uploaded.
              </p>
              <Button
                variant="secondary"
                size="sm"
                loading={sourceBusy}
                onClick={() => fileRef.current?.click()}
              >
                Browse files
              </Button>
              <small>JSON · up to 5 MB</small>
            </div>
          )}

          {sourceKind === "paste" && (
            <div className="source-form">
              <label className="field-label" htmlFor="abi-paste">
                ABI JSON
              </label>
              <textarea
                id="abi-paste"
                className="field mono textarea"
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                placeholder={'[{"type":"function","name":"balanceOf",…}]'}
                spellCheck={false}
              />
              <div className="source-form-actions">
                <Button
                  variant="primary"
                  icon={<Braces size={15} />}
                  onClick={handlePaste}
                >
                  Validate & load
                </Button>
                <span className="hint">Kept in this browser only.</span>
              </div>
            </div>
          )}

          {sourceKind === "url" && (
            <div className="source-form">
              <label className="field-label" htmlFor="abi-url">
                HTTPS URL
              </label>
              <div className="inline-field">
                <input
                  id="abi-url"
                  className="field mono"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/MyContract.json"
                  spellCheck={false}
                />
                <Button
                  variant="primary"
                  loading={sourceBusy}
                  disabled={!urlPreview || urlPreview.invalid || !urlPreview.secure}
                  onClick={() => void handleUrl()}
                >
                  Fetch
                </Button>
              </div>
              {urlPreview && (
                <div className="url-preview">
                  {urlPreview.invalid ? (
                    <p className="check-line warning">
                      <AlertTriangle size={13} /> Enter a full URL, including
                      https://.
                    </p>
                  ) : (
                    <>
                      <span className="url-origin mono">{urlPreview.origin}</span>
                      <span className="url-path mono">{urlPreview.path}</span>
                      {!urlPreview.secure && (
                        <p className="check-line warning">
                          <AlertTriangle size={13} /> Only HTTPS endpoints are
                          fetched. HTTP is allowed for localhost.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              <p className="hint">
                The host must allow cross-origin requests. Localhost is allowed
                for development.
              </p>
            </div>
          )}

          {sourceKind === "explorer" && (
            <div className="source-form">
              <div className="explorer-note">
                <ShieldAlert size={16} />
                <div>
                  <strong>Verified contracts only</strong>
                  <p>
                    This optional lookup asks Etherscan for a published ABI.
                    Unverified contracts will fail here — use a local artifact
                    instead.
                  </p>
                </div>
              </div>

              {settings.etherscanKey ? (
                <p className="check-line success">
                  <KeyRound size={14} /> Using your local Etherscan key.
                </p>
              ) : (
                <p className="check-line warning">
                  <KeyRound size={14} /> No key set.{" "}
                  <Link to="/settings" className="text-link">
                    Add one in Settings
                  </Link>
                  .
                </p>
              )}

              <div className="explorer-target">
                <span className="mono">
                  {normalizedAddress ?? "Enter an address on the right"}
                </span>
                <ChainBadge chainId={chainId} />
              </div>

              <Button
                variant="primary"
                loading={sourceBusy}
                disabled={!normalizedAddress || !explorerAbiSupported(chainId)}
                onClick={() => void handleExplorer()}
              >
                <Globe2 size={15} /> Look up verified ABI
              </Button>
              {!explorerAbiSupported(chainId) && (
                <p className="hint">
                  Etherscan lookup is not available for {chainName(chainId)}.
                </p>
              )}
            </div>
          )}

          {sourceError.length > 0 && <IssueList issues={sourceError} />}

          <div className="source-or">
            <span>or</span>
          </div>

          {abiSummary}
        </section>

        <section className="panel import-bind-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">STEP 02</p>
              <h2>Contract binding</h2>
            </div>
            {existing && <Badge tone="amber">Already saved</Badge>}
          </div>

          <div className="form-grid">
            <label className="field-group">
              <span className="field-label">Contract name</span>
              <input
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={existing?.name ?? "e.g. Treasury Vault"}
              />
              <small>Optional. Shown only in this workspace.</small>
            </label>

            <label className="field-group">
              <span className="field-label">Contract address</span>
              <input
                className={cn(
                  "field mono",
                  address && !addressValid && "invalid",
                )}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
              <small className={cn(address && !addressValid && "danger-text")}>
                {address && !addressValid
                  ? "That is not a valid EVM address."
                  : "EIP-55 checksum applied automatically."}
              </small>
            </label>

            <label className="field-group">
              <span className="field-label">Network</span>
              <select
                className="field"
                value={chainId}
                onChange={(event) => setChainId(Number(event.target.value))}
              >
                {CHAINS.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chainName(chain.id)}
                    {chain.testnet ? " · testnet" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="code-check">
            <div className="code-check-heading">
              <span className="eyebrow">CODE CHECK</span>
              <Badge tone={codeQuery.data?.codeSize ? "green" : "muted"}>
                {codeQuery.data?.codeSize
                  ? `${codeQuery.data.codeSize} bytes`
                  : "Not loaded"}
              </Badge>
            </div>
            {codeStatus}
            {codeQuery.data?.proxy && (
              <p className="check-line warning">
                <ShieldAlert size={14} /> Proxy detected:{" "}
                {codeQuery.data.proxy.kind.replace("eip", "EIP-")}
                {"implementation" in codeQuery.data.proxy &&
                  codeQuery.data.proxy.implementation && (
                    <span
                      className="mono"
                      title={`Proxy implementation ${codeQuery.data.proxy.implementation}`}
                    >
                      {" "}
                      · implementation{" "}
                      {shortHash(codeQuery.data.proxy.implementation, 6)}
                    </span>
                  )}
              </p>
            )}
          </div>

          {existing && (
            <div className="existing-contract">
              <div>
                <p className="eyebrow">EXISTING BINDING</p>
                <strong>{existing.name}</strong>
                <small>
                  Current ABI hash{" "}
                  {existingRevision ? shortHash(existingRevision.hash, 8) : "unknown"}
                </small>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate(
                    `/contract/${existing.chainId}/${existing.address}/overview`,
                  )
                }
              >
                Open existing <ArrowRight size={14} />
              </Button>
            </div>
          )}

          <div className="review-box">
            <p className="eyebrow">STEP 03 · REVIEW</p>
            <dl className="review-list">
              <div>
                <dt>ABI hash</dt>
                <dd>
                  {imported ? (
                    <span className="mono">{shortHash(imported.hash, 9)}</span>
                  ) : (
                    <span className="muted">Not loaded</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd className="mono">
                  {normalizedAddress ?? <span className="muted">Not set</span>}
                </dd>
              </div>
              <div>
                <dt>Chain</dt>
                <dd>
                  <ChainBadge chainId={chainId} />
                </dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>
                  {!normalizedAddress
                    ? "Not checked"
                    : codeQuery.isLoading
                      ? "Checking…"
                      : codeQuery.data?.codeSize
                        ? "Contract present"
                        : codeQuery.isError
                          ? "Unverified (RPC error)"
                          : "No code"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="binding-actions">
            <Button
              variant="primary"
              size="lg"
              icon={<ArrowRight size={16} />}
              disabled={!canOpen}
              onClick={() => openWorkspace(false)}
            >
              {existing ? "Update ABI & open" : "Open workspace"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={!canOpen}
              onClick={() => openWorkspace(true)}
            >
              Save without opening
            </Button>
          </div>

          {!imported && (
            <p className="binding-hint">
              Load an ABI from step 01 to enable this action.
            </p>
          )}
          {codeQuery.data?.codeSize === 0 && (
            <p className="binding-hint danger-text">
              This address has no code on {chainName(chainId)}. Check the chain
              and address before continuing.
            </p>
          )}
          {!walletAddress && (
            <p className="binding-hint">
              A wallet is only needed for write methods. Reads work without one.
            </p>
          )}
        </section>
      </div>

      <div className="import-footnote">
        <Hash size={14} />
        <span>
          The ABI hash is computed locally and stored with this contract
          revision. It is derived from the exact JSON you imported.
        </span>
      </div>
    </div>
  );
}
