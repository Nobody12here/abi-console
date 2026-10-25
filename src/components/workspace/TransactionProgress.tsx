import type { Hex } from "viem";
import {
  Check,
  CircleX,
  Clock3,
  ExternalLink,
  Loader2,
  PenLine,
  Radio,
} from "lucide-react";
import type { TxRecord } from "@/features/abi/types";
import { CopyButton } from "@/components/ui/CopyButton";
import { explorerTxUrl } from "@/lib/chains";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

type Step = "idle" | "done" | "active" | "failed";

function StepIcon({ state }: { state: Step }) {
  if (state === "done") return <Check size={12} />;
  if (state === "failed") return <CircleX size={12} />;
  if (state === "active") return <Loader2 size={12} className="spin" />;
  return <Clock3 size={12} />;
}

export function TransactionProgress({
  tx,
  signing,
  error,
  chainId,
  hash,
}: {
  tx?: TxRecord;
  signing?: boolean;
  error?: string;
  chainId: number;
  hash?: Hex;
}) {
  if (!tx && !signing && !error && !hash) return null;

  const status = tx?.status;
  const signatureState: Step =
    status === "rejected"
      ? "failed"
      : status === "awaiting-signature" || signing
        ? "active"
        : tx
          ? "done"
          : "idle";
  const pendingState: Step =
    status === "confirmed"
      ? "done"
      : status === "failed"
        ? "failed"
        : status === "pending" || hash
          ? "active"
          : "idle";
  const finalState: Step =
    status === "confirmed" ? "done" : status === "failed" ? "failed" : "idle";

  const txHash = tx?.hash ?? hash;
  const explorer = txHash ? explorerTxUrl(chainId, txHash) : undefined;

  return (
    <div className={cn("tx-progress", status && `status-${status}`)}>
      <div className="tx-progress-heading">
        <span className="eyebrow">TRANSACTION</span>
        {status && (
          <span className={cn("tx-status-chip", `tx-${status}`)}>
            {status.replace("-", " ")}
          </span>
        )}
      </div>

      <ol className="tx-steps">
        <li className="done">
          <StepIcon state="done" />
          Simulated
        </li>
        <li className={signatureState}>
          <StepIcon state={signatureState} />
          {status === "rejected" ? "Signature rejected" : "Wallet signature"}
        </li>
        <li className={pendingState}>
          <StepIcon state={pendingState} />
          {status === "pending" ? "Pending" : "Broadcast"}
        </li>
        <li className={finalState}>
          <StepIcon state={finalState} />
          {status === "confirmed"
            ? "Confirmed"
            : status === "failed"
              ? "Failed"
              : "Receipt"}
        </li>
      </ol>

      {txHash && (
        <div className="tx-hash-row">
          <span className="mono">{shortHash(txHash, 10)}</span>
          <CopyButton value={txHash} label="Copy transaction hash" compact />
          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Explorer <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {status === "pending" && (
        <p className="tx-note">
          <Radio size={13} /> Waiting for a receipt. You can keep using the
          console; this transaction is tracked in the history.
        </p>
      )}
      {status === "awaiting-signature" && (
        <p className="tx-note">
          <PenLine size={13} /> Confirm or reject the request in your wallet.
        </p>
      )}
      {status === "confirmed" && tx && (
        <p className="tx-note success">
          <Check size={13} /> Confirmed
          {tx.blockNumber ? ` in block ${tx.blockNumber}` : ""}
          {tx.gasUsed ? ` · ${BigInt(tx.gasUsed).toLocaleString()} gas` : ""}
        </p>
      )}
      {(error || tx?.error) && (
        <p className="tx-note danger">
          <CircleX size={13} /> {error ?? tx?.error?.message}
        </p>
      )}
    </div>
  );
}
