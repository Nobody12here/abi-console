import { Check, CircleX, Circle, ExternalLink, Loader2 } from "lucide-react";
import type { TxRecord } from "@/features/abi/types";
import { CopyButton } from "@/components/ui/CopyButton";
import { explorerTxUrl } from "@/lib/chains";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

type Step = "idle" | "done" | "active" | "failed";

function StepIcon({ state }: { state: Step }) {
  if (state === "done") return <Check size={13} />;
  if (state === "failed") return <CircleX size={13} />;
  if (state === "active") return <Loader2 size={13} className="spin" />;
  return <Circle size={13} />;
}

export function TransactionProgress({
  tx,
  chainId,
}: {
  tx: TxRecord;
  chainId: number;
}) {
  const { status } = tx;
  const signState: Step =
    status === "rejected"
      ? "failed"
      : status === "awaiting-signature"
        ? "active"
        : status === "failed" && !tx.hash
          ? "failed"
          : "done";
  const minedState: Step =
    status === "confirmed"
      ? "done"
      : status === "failed" && tx.hash
        ? "failed"
        : status === "pending"
          ? "active"
          : "idle";

  const explorer = tx.hash ? explorerTxUrl(chainId, tx.hash) : undefined;

  return (
    <div className="tx-progress">
      <ol className="tx-steps">
        <li className={signState}>
          <StepIcon state={signState} />
          {status === "rejected" ? "Rejected in wallet" : "Signed"}
        </li>
        <li className={minedState}>
          <StepIcon state={minedState} />
          {status === "confirmed"
            ? `Confirmed${tx.blockNumber ? ` in block ${tx.blockNumber}` : ""}`
            : status === "failed" && tx.hash
              ? "Reverted"
              : status === "pending"
                ? "Waiting for confirmation"
                : "Confirmed"}
        </li>
      </ol>

      {tx.hash && (
        <div className="tx-hash-row">
          <span className="mono">{shortHash(tx.hash, 10)}</span>
          <CopyButton value={tx.hash} label="Copy transaction hash" compact />
          {explorer && (
            <a href={explorer} target="_blank" rel="noreferrer" className="text-link">
              View on explorer <ExternalLink size={12} />
            </a>
          )}
          {status === "confirmed" && tx.gasUsed && (
            <span className="muted">
              {BigInt(tx.gasUsed).toLocaleString()} gas used
            </span>
          )}
        </div>
      )}

      {status === "awaiting-signature" && (
        <p className="hint">Confirm or reject the request in your wallet.</p>
      )}
      {tx.error && status !== "awaiting-signature" && (
        <p className={cn("status-line", status === "rejected" ? "muted" : "danger")}>
          {tx.error.message}
        </p>
      )}
    </div>
  );
}
