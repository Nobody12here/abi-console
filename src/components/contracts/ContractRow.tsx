import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { shortenAddress, relativeTime } from "@/lib/format";

export function ContractRow({
  binding,
  revision,
  onDelete,
}: {
  binding: ContractBinding;
  revision: AbiRevision | undefined;
  onDelete: (binding: ContractBinding) => void;
}) {
  // A name equal to the address adds nothing, so show the short form instead.
  const unnamed = binding.name === binding.address;

  return (
    <div className="table-row contract-grid">
      <div className="contract-cell-name">
        <Link
          className="contract-link"
          to={`/contract/${binding.chainId}/${binding.address}`}
        >
          {unnamed ? shortenAddress(binding.address, 6) : binding.name}
        </Link>
        <span className="contract-address mono">
          {shortenAddress(binding.address, 6)}
          <CopyButton value={binding.address} label="Copy address" compact />
        </span>
      </div>
      <span className="cell" data-label="Network">
        <ChainBadge chainId={binding.chainId} />
      </span>
      <span className="cell muted" data-label="Functions">
        {revision
          ? `${revision.counts.readFunctions} read · ${revision.counts.writeFunctions} write`
          : "No ABI"}
      </span>
      <span className="cell muted" data-label="Last opened">
        {relativeTime(binding.lastOpenedAt)}
      </span>
      <span className="cell cell-actions">
        <button
          type="button"
          className="icon-btn small danger"
          aria-label={`Remove ${binding.name}`}
          title="Remove contract"
          onClick={() => onDelete(binding)}
        >
          <Trash2 size={14} />
        </button>
      </span>
    </div>
  );
}
