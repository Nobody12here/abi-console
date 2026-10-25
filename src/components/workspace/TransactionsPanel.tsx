import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import type {
  ContractBinding,
  TxRecord,
  TxStatus,
} from "@/features/abi/types";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { createReadClient } from "@/lib/rpc";
import { explorerTxUrl, getChain } from "@/lib/chains";
import {
  absoluteTime,
  formatNativeValue,
  relativeTime,
  shortHash,
  toJson,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_LABEL: Record<TxStatus, string> = {
  "awaiting-signature": "Awaiting signature",
  pending: "Pending",
  confirmed: "Confirmed",
  failed: "Failed",
  rejected: "Rejected",
  replaced: "Replaced",
};

const FILTERS: Array<{ id: "all" | TxStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "failed", label: "Failed" },
  { id: "rejected", label: "Rejected" },
];

function formatValue(value: string, chainId: number): string | undefined {
  try {
    const wei = BigInt(value || "0");
    if (wei === 0n) return undefined;
    return formatNativeValue(wei, getChain(chainId)?.nativeCurrency.symbol ?? "ETH");
  } catch {
    return undefined;
  }
}

export function TransactionsPanel({
  contract,
  txs,
}: {
  contract: ContractBinding;
  txs: TxRecord[];
}) {
  const { settings, updateTx, clearTxs } = useWorkspace();
  const [filter, setFilter] = useState<"all" | TxStatus>("all");
  const [checking, setChecking] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const ordered = useMemo(
    () =>
      [...txs].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [txs],
  );

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: ordered.length };
    for (const tx of ordered) {
      result[tx.status] = (result[tx.status] ?? 0) + 1;
    }
    return result;
  }, [ordered]);

  const filtered = useMemo(
    () =>
      filter === "all"
        ? ordered
        : ordered.filter((tx) => tx.status === filter),
    [filter, ordered],
  );

  const checkStatus = async (tx: TxRecord) => {
    if (!tx.hash) {
      toast.error("This transaction has no hash yet.");
      return;
    }
    setChecking(tx.id);
    try {
      const client = createReadClient(tx.chainId, settings.rpcOverrides);
      const receipt = await client.getTransactionReceipt({ hash: tx.hash });
      updateTx(tx.id, {
        status: receipt.status === "success" ? "confirmed" : "failed",
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        ...(receipt.status === "success"
          ? {}
          : {
              error: {
                message: "The transaction was included but reverted on-chain.",
              },
            }),
      });
      toast.success(
        receipt.status === "success"
          ? "Transaction confirmed."
          : "Transaction reverted on-chain.",
      );
    } catch {
      toast.error("No receipt yet. The transaction may still be pending.");
    } finally {
      setChecking(null);
    }
  };

  if (txs.length === 0) {
    return (
      <EmptyState
        icon={<History size={22} />}
        eyebrow="LOCAL AUDIT TRAIL"
        title="No transactions for this contract yet"
        description={
          <>
            Writes sent from this console are recorded here with their status,
            hash, value, and decoded errors. The history survives a reload and
            stays scoped to this contract binding.
          </>
        }
      />
    );
  }

  return (
    <div className="transactions-panel">
      <div className="tx-toolbar">
        <div className="status-filters" role="group" aria-label="Filter transactions">
          {FILTERS.map((entry) => {
            const count = counts[entry.id] ?? 0;
            if (entry.id !== "all" && count === 0) return null;
            return (
              <button
                key={entry.id}
                type="button"
                className={cn("status-filter", filter === entry.id && "selected")}
                aria-pressed={filter === entry.id}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="tx-toolbar-actions">
          <span className="hint">
            {ordered.length} local record{ordered.length === 1 ? "" : "s"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={13} />}
            onClick={() => setClearOpen(true)}
          >
            Clear history
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-inline">
          <Clock3 size={14} /> No transactions with this status.
        </p>
      ) : (
        <div className="tx-list">
          {filtered.map((tx) => {
            const explorer = tx.hash
              ? explorerTxUrl(tx.chainId, tx.hash)
              : undefined;
            const value = formatValue(tx.value, tx.chainId);
            return (
              <article key={tx.id} className={cn("tx-record", `tx-${tx.status}`)}>
                <div className="tx-record-head">
                  <span className={cn("tx-status-chip", `tx-${tx.status}`)}>
                    {tx.status === "confirmed" ? (
                      <CheckCircle2 size={12} />
                    ) : tx.status === "failed" ||
                      tx.status === "rejected" ? (
                      <XCircle size={12} />
                    ) : (
                      <Clock3 size={12} />
                    )}
                    {STATUS_LABEL[tx.status]}
                  </span>
                  <div className="tx-record-title">
                    <strong className="mono">
                      {tx.signature.split("(")[0]}
                    </strong>
                    <span className="mono tx-signature-full" title={tx.signature}>
                      {tx.signature}
                    </span>
                  </div>
                  <time dateTime={tx.createdAt} title={absoluteTime(tx.createdAt)}>
                    {relativeTime(tx.createdAt)}
                  </time>
                </div>

                <div className="tx-record-meta">
                  <span>
                    Selector <code className="mono">{tx.selector}</code>
                  </span>
                  {value && <span>Value {value}</span>}
                  {tx.blockNumber && (
                    <span>Block <code className="mono">{tx.blockNumber}</code></span>
                  )}
                  {tx.gasUsed && (
                    <span>
                      Gas <code className="mono">{BigInt(tx.gasUsed).toLocaleString()}</code>
                    </span>
                  )}
                  {tx.hash && (
                    <span className="tx-hash-inline">
                      Hash <code className="mono">{shortHash(tx.hash, 8)}</code>
                      <CopyButton value={tx.hash} label="Copy hash" compact />
                    </span>
                  )}
                </div>

                {tx.error && (
                  <div className="tx-error">
                    <ShieldAlert size={14} />
                    <div>
                      <strong>
                        {tx.error.decodedName
                          ? `Reverted · ${tx.error.decodedName}`
                          : "Transaction error"}
                      </strong>
                      <p className="mono">{tx.error.message}</p>
                    </div>
                  </div>
                )}

                <div className="tx-record-actions">
                  {tx.status === "pending" && tx.hash && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<RefreshCw size={13} />}
                      loading={checking === tx.id}
                      onClick={() => void checkStatus(tx)}
                    >
                      Check status
                    </Button>
                  )}
                  {explorer && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={explorer}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Explorer <ExternalLink size={12} />
                    </a>
                  )}
                  <details className="tx-args">
                    <summary>Arguments &amp; raw record</summary>
                    <div className="tx-args-body">
                      <p className="eyebrow">ARGS</p>
                      <pre className="mono">{toJson(tx.args)}</pre>
                      <p className="eyebrow">RECORD</p>
                      <pre className="mono">
                        {toJson({
                          id: tx.id,
                          contractId: tx.contractId,
                          chainId: tx.chainId,
                          address: tx.address,
                          status: tx.status,
                          createdAt: tx.createdAt,
                          updatedAt: tx.updatedAt,
                        })}
                      </pre>
                    </div>
                  </details>
                  {tx.hash && explorer && (
                    <a
                      className="icon-link"
                      href={explorer}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open transaction in explorer"
                    >
                      <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="tx-footnote">
        <Badge tone="muted">Local only</Badge>
        <span>
          Records live in this browser. Status is reconciled against{" "}
          {contract.chainId} through your configured RPC.
        </span>
      </div>

      <ConfirmDialog
        open={clearOpen}
        title="Clear transaction history?"
        description="This removes every local transaction record for this contract. The contract binding and ABI revisions are kept, and no on-chain transaction is affected."
        confirmLabel="Clear history"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          clearTxs(contract.id);
          setClearOpen(false);
          toast.success("Transaction history cleared.");
        }}
      />
    </div>
  );
}
