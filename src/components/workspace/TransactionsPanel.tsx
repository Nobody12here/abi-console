import { useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
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

const STATUS_TONE: Record<TxStatus, string> = {
  "awaiting-signature": "tag-amber",
  pending: "tag-amber",
  confirmed: "tag-green",
  failed: "tag-red",
  rejected: "tag-neutral",
  replaced: "tag-neutral",
};

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

  const checkStatus = async (tx: TxRecord) => {
    if (!tx.hash) return;
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
      toast.error("No receipt yet. It may still be pending.");
    } finally {
      setChecking(null);
    }
  };

  if (txs.length === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        description="Transactions you send from the Write tab are listed here, with their status and any revert reason. The list is stored in this browser."
      />
    );
  }

  return (
    <div className="transactions-panel">
      <div className="toolbar">
        <span className="muted toolbar-count">
          {ordered.length} transaction{ordered.length === 1 ? "" : "s"}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setClearOpen(true)}>
          Clear history
        </Button>
      </div>

      <div className="table">
        {ordered.map((tx) => {
          const explorer = tx.hash ? explorerTxUrl(tx.chainId, tx.hash) : undefined;
          const value = formatValue(tx.value, tx.chainId);
          return (
            <div key={tx.id} className="tx-row">
              <div className="tx-row-main">
                <span className={cn("tag", STATUS_TONE[tx.status])}>
                  {STATUS_LABEL[tx.status]}
                </span>
                <strong className="mono" title={tx.signature}>
                  {tx.signature.split("(")[0]}
                </strong>
                {value && <span className="muted">{value}</span>}
                <time
                  className="muted tx-time"
                  dateTime={tx.createdAt}
                  title={absoluteTime(tx.createdAt)}
                >
                  {relativeTime(tx.createdAt)}
                </time>
              </div>

              <div className="tx-row-meta">
                {tx.hash && (
                  <span className="inline-copy">
                    <span className="mono">{shortHash(tx.hash, 8)}</span>
                    <CopyButton value={tx.hash} label="Copy hash" compact />
                  </span>
                )}
                {tx.blockNumber && <span className="muted">Block {tx.blockNumber}</span>}
                {tx.gasUsed && (
                  <span className="muted">
                    {BigInt(tx.gasUsed).toLocaleString()} gas
                  </span>
                )}
                {explorer && (
                  <a className="text-link" href={explorer} target="_blank" rel="noreferrer">
                    Explorer <ExternalLink size={12} />
                  </a>
                )}
                {tx.status === "pending" && tx.hash && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RefreshCw size={13} />}
                    loading={checking === tx.id}
                    onClick={() => void checkStatus(tx)}
                  >
                    Check status
                  </Button>
                )}
              </div>

              {tx.error && (
                <p
                  className={cn(
                    "status-line",
                    tx.status === "rejected" ? "muted" : "danger",
                  )}
                >
                  {tx.error.decodedName ? `${tx.error.decodedName}: ` : ""}
                  {tx.error.message}
                </p>
              )}

              <details className="advanced">
                <summary>Arguments</summary>
                <pre className="mono code-block">{toJson(tx.args)}</pre>
              </details>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={clearOpen}
        title="Clear transaction history?"
        description="This removes the saved list of transactions for this contract from your browser. Nothing changes on-chain."
        confirmLabel="Clear history"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          clearTxs(contract.id);
          setClearOpen(false);
          toast.success("History cleared.");
        }}
      />
    </div>
  );
}
