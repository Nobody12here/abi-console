import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ExternalLink, Pencil, X } from "lucide-react";
import type { ContractBinding } from "@/features/abi/types";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { explorerAddressUrl } from "@/lib/chains";
import { explorerName } from "@/lib/explorer";

export function ContractHeader({ binding }: { binding: ContractBinding }) {
  const { updateBinding } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(binding.name);
  const explorer = explorerAddressUrl(binding.chainId, binding.address);

  const cancel = () => {
    setEditing(false);
    setName(binding.name);
  };

  const saveName = () => {
    const next = name.trim();
    if (!next) return cancel();
    updateBinding(binding.id, { name: next });
    setEditing(false);
  };

  return (
    <header className="contract-header">
      <Link to="/" className="back-link">
        <ArrowLeft size={14} /> Contracts
      </Link>

      {editing ? (
        <div className="rename-row">
          <input
            className="field"
            value={name}
            autoFocus
            aria-label="Contract name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveName();
              if (event.key === "Escape") cancel();
            }}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Save name"
            onClick={saveName}
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cancel rename"
            onClick={cancel}
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="contract-name-row">
          <h1>{binding.name}</h1>
          <button
            type="button"
            className="icon-btn small"
            aria-label="Rename contract"
            title="Rename"
            onClick={() => {
              setName(binding.name);
              setEditing(true);
            }}
          >
            <Pencil size={13} />
          </button>
        </div>
      )}

      <div className="contract-subline">
        <ChainBadge chainId={binding.chainId} />
        <span className="mono address-text">{binding.address}</span>
        <CopyButton value={binding.address} label="Copy address" compact />
        {explorer && (
          <a
            className="text-link"
            href={explorer}
            target="_blank"
            rel="noreferrer"
          >
            {explorerName(binding.chainId)} <ExternalLink size={12} />
          </a>
        )}
      </div>
    </header>
  );
}
