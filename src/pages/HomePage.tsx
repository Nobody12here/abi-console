import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  FileJson2,
  FolderInput,
  FolderTree,
  Link2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import type { ContractBinding } from "@/features/abi/types";
import { ContractRow } from "@/components/contracts/ContractRow";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/Brand";
import { Spinner } from "@/components/ui/Spinner";
import { plural, relativeTime } from "@/lib/format";
import { DEFAULT_WORKSPACE_ID } from "@/features/storage/workspaces";

export function HomePage() {
  const {
    ready,
    bindings: allBindings,
    activeBindings: bindings,
    txs: allTxs,
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    renameWorkspace,
    deleteWorkspace,
    removeBinding,
    revisionFor,
  } = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ContractBinding | null>(
    null,
  );
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const isDefault = activeWorkspace.id === DEFAULT_WORKSPACE_ID;

  // Numbers on this page describe the workspace being viewed.
  const txs = useMemo(() => {
    const ids = new Set(bindings.map((binding) => binding.id));
    return allTxs.filter((tx) => ids.has(tx.contractId));
  }, [allTxs, bindings]);

  const sorted = useMemo(
    () =>
      [...bindings].sort(
        (a, b) =>
          new Date(b.lastOpenedAt).getTime() -
          new Date(a.lastOpenedAt).getTime(),
      ),
    [bindings],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((binding) =>
      `${binding.name} ${binding.address} ${binding.chainId}`
        .toLowerCase()
        .includes(needle),
    );
  }, [search, sorted]);

  const methods = bindings.reduce(
    (total, binding) => total + (revisionFor(binding)?.counts.functions ?? 0),
    0,
  );
  const confirmed = txs.filter((tx) => tx.status === "confirmed").length;
  const chains = new Set(bindings.map((binding) => binding.chainId)).size;
  const lastActivity = sorted[0];

  if (!ready) {
    return (
      <div className="page-loading">
        <Spinner label="Loading workspace" />
        <span>Loading local workspace…</span>
      </div>
    );
  }

  return (
    <div className="page home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-kicker">
            <span className="pulse-dot" />
            Unverified-first contract workbench
          </p>
          <h1>
            Bind an ABI.
            <br />
            <em>Talk to the chain.</em>
          </h1>
          <p className="home-lede">
            Load the interface from your build, a file, or a URL and use it
            against any deployed address. No source verification, no explorer
            detour, no keys leaving this browser.
          </p>

          <div className="home-actions">
            <Button
              variant="primary"
              size="lg"
              icon={<Plus size={16} />}
              onClick={() => navigate("/import")}
            >
              Import a contract
            </Button>
          </div>

          <ul className="home-proof">
            <li>
              <ShieldCheck size={14} /> Local-first storage
            </li>
            <li>
              <Terminal size={14} /> Simulation before every write
            </li>
            <li>
              <Sparkles size={14} /> ABI hash + selector visible
            </li>
          </ul>
        </div>

        <aside className="source-index" aria-label="Import sources">
          <div className="source-index-heading">
            <p className="eyebrow">START FROM</p>
            <span>5 sources</span>
          </div>

          <Link to="/import/project" className="source-row">
            <span className="source-row-icon">
              <FolderTree size={17} />
            </span>
            <span>
              <strong>Foundry project</strong>
              <small>Every contract from forge script</small>
            </span>
            <ArrowRight size={15} />
          </Link>

          <Link to="/import?source=file" className="source-row">
            <span className="source-row-icon">
              <FolderInput size={17} />
            </span>
            <span>
              <strong>Build artifact</strong>
              <small>Foundry · Hardhat · Truffle</small>
            </span>
            <ArrowRight size={15} />
          </Link>
          <Link to="/import?source=paste" className="source-row">
            <span className="source-row-icon">
              <FileJson2 size={17} />
            </span>
            <span>
              <strong>Paste JSON</strong>
              <small>Bare ABI or full artifact</small>
            </span>
            <ArrowRight size={15} />
          </Link>
          <Link to="/import?source=url" className="source-row">
            <span className="source-row-icon">
              <Link2 size={17} />
            </span>
            <span>
              <strong>Fetch from URL</strong>
              <small>HTTPS or localhost</small>
            </span>
            <ArrowRight size={15} />
          </Link>
          <Link to="/import?source=explorer" className="source-row">
            <span className="source-row-icon">
              <Braces size={17} />
            </span>
            <span>
              <strong>Explorer lookup</strong>
              <small>Verified contracts · BYOK</small>
            </span>
            <ArrowRight size={15} />
          </Link>

        </aside>
      </section>

      <section className="stat-strip" aria-label="Workspace summary">
        <div>
          <span className="stat-value">{bindings.length}</span>
          <span className="stat-label">
            {bindings.length === 1 ? "Contract" : "Contracts"}
          </span>
        </div>
        <div>
          <span className="stat-value">{methods}</span>
          <span className="stat-label">
            {methods === 1 ? "Indexed method" : "Indexed methods"}
          </span>
        </div>
        <div>
          <span className="stat-value">{chains}</span>
          <span className="stat-label">
            {chains === 1 ? "Network" : "Networks"}
          </span>
        </div>
        <div>
          <span className="stat-value">{confirmed}</span>
          <span className="stat-label">
            {confirmed === 1 ? "Confirmed write" : "Confirmed writes"}
          </span>
        </div>
        <div className="stat-strip-note">
          <span className="eyebrow">LAST ACTIVITY</span>
          <strong>
            {lastActivity
              ? `${lastActivity.name} · ${relativeTime(lastActivity.lastOpenedAt)}`
              : "No workspace activity yet"}
          </strong>
        </div>
      </section>

      <section className="recent-section">
        <PageHeader
          eyebrow="WORKSPACE"
          title={activeWorkspace.name}
          description={
            isDefault
              ? "Contracts you added one at a time. Every interface stays on this device."
              : "Created from a Foundry project import. Every interface stays on this device."
          }
          actions={
            <div className="recent-actions">
              {workspaces.length > 1 && (
                <label className="workspace-switch">
                  <span>Workspace</span>
                  <select
                    className="field"
                    value={activeWorkspace.id}
                    onChange={(event) => {
                      setActiveWorkspace(event.target.value);
                      setSearch("");
                      setRenaming(false);
                    }}
                    aria-label="Switch workspace"
                  >
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name} —{" "}
                        {plural(
                          allBindings.filter(
                            (binding) =>
                              (binding.workspaceId ?? DEFAULT_WORKSPACE_ID) ===
                              workspace.id,
                          ).length,
                          "contract",
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {bindings.length > 0 && (
                <label className="search-field">
                  <Search size={14} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, address, chain"
                    aria-label="Search contracts"
                  />
                </label>
              )}
            </div>
          }
        />

        {!isDefault && (
          <div className="workspace-bar">
            {renaming ? (
              <form
                className="workspace-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  renameWorkspace(activeWorkspace.id, renameDraft);
                  setRenaming(false);
                }}
              >
                <input
                  className="field"
                  value={renameDraft}
                  autoFocus
                  aria-label="Workspace name"
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setRenaming(false);
                  }}
                />
                <Button type="submit" size="sm" variant="secondary">
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRenaming(false)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenameDraft(activeWorkspace.name);
                    setRenaming(true);
                  }}
                >
                  Rename workspace
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={13} />}
                  onClick={() => setDeletingWorkspace(true)}
                >
                  Delete workspace
                </Button>
              </>
            )}
          </div>
        )}

        {bindings.length === 0 ? (
          <EmptyState
            icon={<Braces size={22} />}
            eyebrow="READY WHEN YOU ARE"
            title={`No contracts in ${activeWorkspace.name}`}
            description={
              <>
                Start with an ABI you already have. A Foundry artifact is the
                fastest path, but a pasted JSON array works just as well. The
                console will check for code at the address and open a full
                read/write surface.
              </>
            }
            action={
              <div className="empty-state-actions">
                <Button
                  variant="primary"
                  icon={<Plus size={15} />}
                  onClick={() => navigate("/import")}
                >
                  Import your first contract
                </Button>
                <Link to="/import/project" className="btn btn-ghost">
                  <FolderTree size={15} /> Import a Foundry project
                </Link>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="no-results">
            <p>No contracts match “{search}”.</p>
            <button type="button" onClick={() => setSearch("")}>
              Clear search
            </button>
          </div>
        ) : (
          <div className="contract-table">
            <div className="contract-table-head" aria-hidden="true">
              <span>Contract</span>
              <span>Chain</span>
              <span>Methods</span>
              <span>ABI hash</span>
              <span>Source</span>
              <span>Opened</span>
            </div>
            {filtered.map((binding) => (
              <ContractRow
                key={binding.id}
                binding={binding}
                revision={revisionFor(binding)}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}
      </section>

      <section className="home-footer-note">
        <div>
          <ShieldCheck size={16} />
          <p>
            <strong>ABI is data, not trust.</strong> This console shows the hash
            you imported and the calldata you sign — not whether that ABI
            matches the deployed bytecode.
          </p>
        </div>
        <Link to="/settings" className="text-link">
          Storage & key settings <ArrowUpRight size={13} />
        </Link>
      </section>

      <ConfirmDialog
        open={deletingWorkspace}
        title={`Delete workspace “${activeWorkspace.name}”?`}
        description={`This removes its ${plural(bindings.length, "contract")}, their ABIs and transaction history from this browser. Other workspaces and the on-chain contracts are not affected.`}
        confirmLabel="Delete workspace"
        onCancel={() => setDeletingWorkspace(false)}
        onConfirm={() => {
          const name = activeWorkspace.name;
          deleteWorkspace(activeWorkspace.id);
          setDeletingWorkspace(false);
          toast.success(`Workspace “${name}” deleted.`);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? "this contract"}?`}
        description="This removes the contract, its ABI revisions, and its local transaction history from this browser. The on-chain contract is not affected."
        confirmLabel="Delete locally"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            removeBinding(pendingDelete.id);
            toast.success(`${pendingDelete.name} removed.`);
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
