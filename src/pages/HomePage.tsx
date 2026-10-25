import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Search } from "lucide-react";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import type { ContractBinding } from "@/features/abi/types";
import { ContractRow } from "@/components/contracts/ContractRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/Brand";
import { PageLoading } from "@/components/ui/PageLoading";
import { chainName } from "@/lib/chains";

export function HomePage() {
  const { ready, bindings, removeBinding, revisionFor } = useWorkspace();
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ContractBinding | null>(
    null,
  );

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
      `${binding.name} ${binding.address} ${chainName(binding.chainId)} ${binding.chainId}`
        .toLowerCase()
        .includes(needle),
    );
  }, [search, sorted]);

  if (!ready) {
    return <PageLoading />;
  }

  return (
    <div className="page">
      <PageHeader
        title="Contracts"
        description="Saved in this browser. Open one to read from it or send transactions."
        actions={
          bindings.length > 0 && (
            <Link to="/import" className="btn btn-primary">
              <Plus size={15} /> Add contract
            </Link>
          )
        }
      />

      {bindings.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description={
            <p>
              Add a contract by entering its address and ABI. You can paste the
              ABI, upload a Foundry or Hardhat build file, load it from a URL,
              or fetch it from Etherscan if the contract is verified.
            </p>
          }
          action={
            <Link to="/import" className="btn btn-primary">
              <Plus size={15} /> Add contract
            </Link>
          }
        />
      ) : (
        <>
          {bindings.length > 5 && (
            <label className="search-field home-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by name, address or network"
                aria-label="Filter contracts"
              />
            </label>
          )}

          {filtered.length === 0 ? (
            <div className="no-results">
              <p>No contracts match “{search}”.</p>
              <button
                type="button"
                className="text-link"
                onClick={() => setSearch("")}
              >
                Clear filter
              </button>
            </div>
          ) : (
            <div className="table contract-table">
              <div className="table-head contract-grid" aria-hidden="true">
                <span>Name</span>
                <span>Network</span>
                <span>Functions</span>
                <span>Last opened</span>
                <span />
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
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Remove ${pendingDelete?.name ?? "this contract"}?`}
        description="This deletes the saved ABI and transaction history for this contract from your browser. Nothing changes on-chain."
        confirmLabel="Remove"
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
