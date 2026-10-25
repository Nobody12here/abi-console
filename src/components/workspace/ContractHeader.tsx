import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Hash,
  Pencil,
  X,
} from "lucide-react";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { CopyButton } from "@/components/ui/CopyButton";
import { Badge } from "@/components/ui/Badge";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { shortHash } from "@/lib/format";
import { explorerAddressUrl } from "@/lib/chains";

export function ContractHeader({
  binding,
  revision,
}: {
  binding: ContractBinding;
  revision: AbiRevision;
}) {
  const { updateBinding } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(binding.name);
  const explorer = explorerAddressUrl(binding.chainId, binding.address);

  const saveName = () => {
    const next = name.trim();
    if (!next) return;
    updateBinding(binding.id, { name: next });
    setEditing(false);
  };

  return (
    <header className="contract-header">
      <div className="contract-breadcrumb">
        <Link to="/">
          <ArrowLeft size={12} /> All contracts
        </Link>
      </div>

      <div className="contract-title-row">
        <div className="contract-title-copy">
          {editing ? (
            <div className="rename-row">
              <input
                className="field"
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName();
                  if (event.key === "Escape") {
                    setEditing(false);
                    setName(binding.name);
                  }
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
                onClick={() => {
                  setEditing(false);
                  setName(binding.name);
                }}
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
                title="Rename contract"
                onClick={() => setEditing(true)}
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
                className="icon-link"
                href={explorer}
                target="_blank"
                rel="noreferrer"
                aria-label="Open contract in explorer"
                title="Open in explorer"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>

        <div className="contract-title-actions">
          <Badge tone="teal" mono title={`ABI hash ${revision.hash}`}>
            <Hash size={11} /> ABI {shortHash(revision.hash, 5)}
          </Badge>
          <CopyButton
            value={window.location.href}
            label="Copy link"
            compact
            className="header-action"
          />
        </div>
      </div>
    </header>
  );
}
