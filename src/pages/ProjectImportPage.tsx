import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  FolderInput,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { Address } from "viem";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { bindingId } from "@/features/storage/workspace";
import {
  canPickDirectory,
  droppedDirectory,
  fsDirFromEntry,
  fsDirFromFileList,
  pickDirectory,
  type FsDir,
} from "@/features/foundry/fs";
import { ProjectError, scanProject } from "@/features/foundry/project";
import { readDeployments } from "@/features/foundry/broadcast";
import {
  buildPlan,
  importStatus,
  loadArtifact,
  type PlanRow,
} from "@/features/foundry/plan";
import { errorMessage } from "@/features/execution/errors";
import { chainName } from "@/lib/chains";
import { createReadClient } from "@/lib/rpc";
import { mapLimit } from "@/lib/async";
import { plural, shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Spinner } from "@/components/ui/Spinner";
import { PageHeader } from "@/components/layout/Brand";

/** Bulk import targets Sepolia, where the project was deployed. */
const CHAIN_ID = 11155111;
const CHAIN_LABEL = chainName(CHAIN_ID);

type Phase = "pick" | "scanning" | "review";
type CodeState = "checking" | "found" | "missing" | "error";

export function ProjectImportPage() {
  const { ready } = useWorkspace();
  // Whether a contract is already saved depends on the stored workspace.
  if (!ready) {
    return (
      <div className="page-loading">
        <Spinner label="Loading workspace" />
        <span>Loading local workspace…</span>
      </div>
    );
  }
  return <ProjectImport />;
}

function ProjectImport() {
  const navigate = useNavigate();
  const { settings, bindings, getRevision, importProject } = useWorkspace();

  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [codes, setCodes] = useState<Record<string, CodeState>>({});
  const [checkRun, setCheckRun] = useState(0);
  const folderInput = useRef<HTMLInputElement>(null);
  const runId = useRef(0);

  const rpcUrl = settings.rpcOverrides[CHAIN_ID] ?? "";
  const rowKeys = rows.map((row) => row.key).join(",");

  // Check each address for contract code, a few at a time.
  useEffect(() => {
    if (!rowKeys) return;
    let cancelled = false;
    const client = createReadClient(CHAIN_ID, { [CHAIN_ID]: rpcUrl });

    void mapLimit(rowKeys.split(","), 5, async (address) => {
      let state: CodeState;
      try {
        const code = await client.getCode({ address: address as Address });
        state = code && code !== "0x" ? "found" : "missing";
      } catch {
        state = "error";
      }
      if (!cancelled) setCodes((current) => ({ ...current, [address]: state }));
    });

    return () => {
      cancelled = true;
    };
  }, [rowKeys, rpcUrl, checkRun]);

  const savedByAddress = useMemo(
    () => new Map(bindings.map((binding) => [binding.id, binding])),
    [bindings],
  );

  const view = rows.map((row) => {
    const saved = savedByAddress.get(bindingId(CHAIN_ID, row.key));
    const status = importStatus(row, {
      activeRevisionHash: saved
        ? getRevision(saved.activeRevisionId)?.hash
        : undefined,
    });
    const code = codes[row.key] ?? "checking";
    const selectable = Boolean(row.abi);
    const checked =
      selectable &&
      (overrides[row.key] ??
        (code !== "missing" && status !== "same"));
    return { row, saved: Boolean(saved), status, code, selectable, checked };
  });

  const selected = view.filter((item) => item.checked);
  const checking = view.some((item) => item.code === "checking");
  const hasCheckErrors = view.some((item) => item.code === "error");

  const analyze = async (getRoot: () => Promise<FsDir | undefined>) => {
    const run = ++runId.current;
    setError(null);
    try {
      const root = await getRoot();
      if (!root) return; // The picker was cancelled.
      setPhase("scanning");

      const scan = await scanProject(root, CHAIN_ID);
      const { deployments, warnings } = await readDeployments(scan);
      if (deployments.length === 0) {
        throw new ProjectError(
          "no-deployments",
          scan.otherChains.length > 0
            ? `No ${CHAIN_LABEL} deployments found. This project only has broadcasts for ${scan.otherChains.map(chainName).join(", ")}.`
            : `No contract deployments for ${CHAIN_LABEL} found in broadcast/. Run your script with “--rpc-url sepolia --broadcast”.`,
        );
      }
      const plan = await buildPlan(scan, deployments);
      if (run !== runId.current) return;

      const nextNotes = [...warnings];
      if (scan.artifacts.length === 0) {
        nextNotes.push(
          `No compiled artifacts found in ${scan.outDir}/. Run “forge build” so the ABIs are available.`,
        );
      }
      if (scan.otherChains.length > 0) {
        nextNotes.push(
          `Also found deployments on ${scan.otherChains.map(chainName).join(", ")}. Only ${CHAIN_LABEL} is imported.`,
        );
      }

      setRows(plan);
      setNotes(nextNotes);
      setProject(scan.name);
      setNames({});
      setOverrides({});
      setCodes({});
      setPhase("review");
    } catch (caught) {
      if (run !== runId.current) return;
      setError(
        caught instanceof ProjectError
          ? caught.message
          : `Could not read that folder: ${errorMessage(caught)}`,
      );
      setPhase("pick");
    }
  };

  const chooseFolder = () => {
    if (canPickDirectory()) void analyze(pickDirectory);
    else folderInput.current?.click();
  };

  const chooseArtifact = async (key: string, path: string) => {
    const row = rows.find((entry) => entry.key === key);
    const artifact = row?.candidates.find((entry) => entry.path === path);
    if (!artifact) return;
    const result = await loadArtifact(artifact);
    setRows((current) =>
      current.map((entry) =>
        entry.key !== key
          ? entry
          : {
              ...entry,
              artifact,
              name: entry.name || artifact.name,
              abi: "imported" in result ? result.imported : undefined,
              abiError: "error" in result ? result.error : undefined,
            },
      ),
    );
  };

  const setAllSelected = (value: boolean) =>
    setOverrides(
      Object.fromEntries(
        view.filter((item) => item.selectable).map((item) => [item.row.key, value]),
      ),
    );

  const runImport = () => {
    const entries = selected.flatMap(({ row }) =>
      row.abi && row.artifact
        ? [
            {
              name: names[row.key]?.trim() || row.name || shortenAddress(row.key, 4),
              address: row.key,
              imported: row.abi,
              source: {
                kind: "foundry" as const,
                artifactPath: row.artifact.path,
                script: row.deployment.script,
              },
            },
          ]
        : [],
    );
    if (entries.length === 0) return;

    try {
      const result = importProject({
        project,
        chainId: CHAIN_ID,
        entries,
      });
      const parts = [`${plural(result.added, "contract")} added`];
      if (result.updated) parts.push(`${result.updated} updated`);
      if (result.unchanged) parts.push(`${result.unchanged} unchanged`);
      toast.success(`${parts.join(", ")}.`);
      navigate("/");
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  const reset = () => {
    runId.current += 1;
    setRows([]);
    setPhase("pick");
    setError(null);
  };

  return (
    <div className="page project-import-page">
      <PageHeader
        eyebrow="BULK IMPORT"
        title="Import a Foundry project"
        description={`Add every contract your forge scripts deployed to ${CHAIN_LABEL}, with its ABI, in one step.`}
        actions={
          <Link to="/import" className="btn btn-ghost">
            <ArrowLeft size={15} /> Import one contract
          </Link>
        }
      />

      {phase !== "review" && (
        <section className="panel">
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
              // The drop data is only valid synchronously, so grab it first.
              const entry = droppedDirectory(event.dataTransfer);
              if (!entry) {
                setError(
                  "Drop the project folder itself, or use “Choose folder”.",
                );
                return;
              }
              void analyze(async () => fsDirFromEntry(entry));
            }}
          >
            <input
              ref={folderInput}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label="Foundry project folder"
              {...({ webkitdirectory: "" } as object)}
              onChange={(event) => {
                const files = event.target.files;
                if (files && files.length > 0) {
                  const root = fsDirFromFileList(files);
                  void analyze(async () => root);
                }
                event.target.value = "";
              }}
            />
            <span className="drop-zone-icon">
              {phase === "scanning" ? (
                <Spinner label="Reading project" />
              ) : (
                <FolderInput size={20} />
              )}
            </span>
            <strong>
              {phase === "scanning"
                ? "Reading your project…"
                : "Drop your Foundry project folder here"}
            </strong>
            <p>
              The folder that contains <code>foundry.toml</code>. Only{" "}
              <code>broadcast/</code> and the build output are read, and
              nothing is uploaded.
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={phase === "scanning"}
              onClick={chooseFolder}
            >
              Choose folder
            </Button>
            <small>forge script script/Deploy.s.sol --rpc-url sepolia --broadcast</small>
          </div>

          {error && (
            <div className="issue-box" role="alert">
              <span className="issue-icon">
                <AlertTriangle size={16} />
              </span>
              <div>
                <strong>Can’t import this folder</strong>
                <p>{error}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {phase === "review" && (
        <section className="panel proj-review">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">REVIEW</p>
              <h2>
                {plural(rows.length, "deployment")} on {CHAIN_LABEL}
              </h2>
            </div>
            <Badge tone={checking ? "muted" : "teal"}>
              {checking
                ? "Checking addresses…"
                : `${selected.length} selected`}
            </Badge>
          </div>

          <label className="field-group proj-project-name">
            <span className="field-label">Project name</span>
            <input
              className="field"
              value={project}
              onChange={(event) => setProject(event.target.value)}
              placeholder="Used to group these contracts"
            />
            <small>Contracts from this import are grouped under this name.</small>
          </label>

          {notes.map((note) => (
            <p key={note} className="check-line warning">
              <AlertTriangle size={14} /> {note}
            </p>
          ))}

          <div className="proj-toolbar">
            <button
              type="button"
              className="text-link"
              onClick={() => setAllSelected(true)}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => setAllSelected(false)}
            >
              Select none
            </button>
            {hasCheckErrors && !checking && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setCodes({});
                  setCheckRun((value) => value + 1);
                }}
              >
                <RefreshCw size={12} /> Check addresses again
              </button>
            )}
          </div>

          <div className="proj-table">
            <div className="proj-grid proj-head" aria-hidden="true">
              <span />
              <span>Contract</span>
              <span>Address</span>
              <span>ABI</span>
              <span>Status</span>
            </div>

            {view.map(({ row, status, code, selectable, checked, saved }) => {
              const picker = row.candidates.length > 1 || !row.deployment.contractName;
              return (
                <div
                  key={row.key}
                  className={cn("proj-grid proj-row", !selectable && "is-muted")}
                >
                  <input
                    type="checkbox"
                    className="proj-check"
                    checked={checked}
                    disabled={!selectable}
                    aria-label={`Import ${names[row.key] ?? row.name ?? row.key}`}
                    onChange={(event) =>
                      setOverrides((current) => ({
                        ...current,
                        [row.key]: event.target.checked,
                      }))
                    }
                  />

                  <div className="proj-cell proj-name">
                    <input
                      className="field"
                      value={names[row.key] ?? row.name}
                      placeholder="Unnamed contract"
                      aria-label="Contract name"
                      onChange={(event) =>
                        setNames((current) => ({
                          ...current,
                          [row.key]: event.target.value,
                        }))
                      }
                    />
                    <small>
                      {row.deployment.script}
                      {row.deployment.nested && " · created by a contract"}
                    </small>
                  </div>

                  <span className="proj-cell mono proj-address">
                    {shortenAddress(row.key, 5)}
                    <CopyButton value={row.key} label="Copy address" compact />
                  </span>

                  <div className="proj-cell proj-abi">
                    {picker ? (
                      <select
                        className="field"
                        value={row.artifact?.path ?? ""}
                        aria-label="ABI artifact"
                        onChange={(event) =>
                          void chooseArtifact(row.key, event.target.value)
                        }
                      >
                        {!row.artifact && <option value="">Choose ABI…</option>}
                        {row.candidates.map((ref) => (
                          <option key={ref.path} value={ref.path}>
                            {row.deployment.contractName
                              ? ref.path
                              : `${ref.name} (${ref.sourceDir})`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.artifact && (
                        <span className="mono proj-path" title={row.artifact.path}>
                          {row.artifact.path}
                        </span>
                      )
                    )}
                    {row.abiError && (
                      <small className="danger-text">{row.abiError}</small>
                    )}
                  </div>

                  <div className="proj-cell proj-status">
                    {code === "checking" && <Badge tone="muted">Checking</Badge>}
                    {code === "found" && <Badge tone="green">On-chain</Badge>}
                    {code === "missing" && (
                      <Badge tone="amber" title="No contract code at this address">
                        No code
                      </Badge>
                    )}
                    {code === "error" && (
                      <Badge tone="muted" title="The RPC did not answer">
                        Can’t check
                      </Badge>
                    )}
                    {saved && status === "same" && (
                      <Badge tone="muted">Already saved</Badge>
                    )}
                    {saved && status === "update" && (
                      <Badge tone="amber">Updates ABI</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="proj-footer">
            <Button
              variant="primary"
              size="lg"
              icon={<ShieldCheck size={16} />}
              disabled={selected.length === 0 || checking}
              onClick={runImport}
            >
              {checking
                ? "Checking addresses…"
                : `Import ${plural(selected.length, "contract")}`}
            </Button>
            <Button variant="ghost" size="lg" onClick={reset}>
              Choose a different folder
            </Button>
          </div>
          <p className="binding-hint">
            Contracts without code on {CHAIN_LABEL} start unchecked: the
            transaction may have been dropped, or the RPC may be behind.
          </p>
        </section>
      )}
    </div>
  );
}
