import { Link } from "react-router-dom";
import { ArrowUpRight, FileCode2, Trash2 } from "lucide-react";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { shortHash, shortenAddress, relativeTime } from "@/lib/format";
import { sourceKindLabel } from "@/features/abi/source";

export function ContractRow({
  binding,
  revision,
  onDelete,
}: {
  binding: ContractBinding;
  revision: AbiRevision | undefined;
  onDelete: (binding: ContractBinding) => void;
}) {
  return (
    <div className="contract-row">
      <Link
        className="contract-row-main"
        to={`/contract/${binding.chainId}/${binding.address}/overview`}
      >
        <span className="contract-row-icon">
          <FileCode2 size={16} />
        </span>
        <span className="contract-row-identity">
          <span className="contract-row-name">{binding.name}</span>
          <span className="contract-row-meta mono">
            {shortenAddress(binding.address, 6)}
          </span>
        </span>
        <span className="contract-row-chain">
          <ChainBadge chainId={binding.chainId} />
        </span>
        <span className="contract-row-methods">
          {revision ? (
            <>
              <span>{revision.counts.readFunctions} read</span>
              <i />
              <span>{revision.counts.writeFunctions} write</span>
            </>
          ) : (
            <span className="muted">No ABI</span>
          )}
        </span>
        <span className="contract-row-hash mono" title={revision?.hash}>
          {revision ? shortHash(revision.hash, 4) : "—"}
        </span>
        <span className="contract-row-source">
          {revision ? sourceKindLabel(revision.source) : "—"}
        </span>
        <span className="contract-row-time">{relativeTime(binding.lastOpenedAt)}</span>
        <ArrowUpRight size={15} className="contract-row-open" />
      </Link>

      <div className="contract-row-actions">
        <CopyButton
          value={binding.address}
          label="Copy address"
          compact
          className="row-action"
        />
        <button
          type="button"
          className="row-action danger"
          aria-label={`Delete ${binding.name}`}
          title="Delete contract"
          onClick={() => onDelete(binding)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
