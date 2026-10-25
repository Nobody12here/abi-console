import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Braces,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCode2,
  Hash,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Waves,
} from "lucide-react";
import type {
  AbiRevision,
  CodeInfo,
  ContractBinding,
  TxRecord,
} from "@/features/abi/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { sourceLabel } from "@/features/abi/source";
import { proxyLabel } from "@/features/abi/utils";
import {
  absoluteTime,
  relativeTime,
  shortHash,
} from "@/lib/format";
import {
  chainName,
  explorerAddressUrl,
  explorerTxUrl,
} from "@/lib/chains";
import { errorMessage } from "@/features/execution/errors";

export function OverviewPanel({
  binding,
  revision,
  revisions,
  txs,
  codeInfo,
  codeLoading,
  codeError,
  onRecheck,
  onUpdateSnapshot,
}: {
  binding: ContractBinding;
  revision: AbiRevision;
  revisions: AbiRevision[];
  txs: TxRecord[];
  codeInfo: CodeInfo | undefined;
  codeLoading: boolean;
  codeError: unknown;
  onRecheck: () => void;
  onUpdateSnapshot: () => void;
}) {
  const savedCode = binding.codeInfo;
  const codeChanged =
    Boolean(savedCode && codeInfo) &&
    savedCode?.codeHash !== codeInfo?.codeHash &&
    (codeInfo?.codeSize ?? 0) > 0;
  const codeMissing = codeInfo?.codeSize === 0;
  const confirmed = txs.filter((tx) => tx.status === "confirmed").length;
  const pending = txs.filter(
    (tx) => tx.status === "pending" || tx.status === "awaiting-signature",
  ).length;
  const explorer = explorerAddressUrl(binding.chainId, binding.address);
  const revisionIndex = revisions.findIndex((item) => item.id === revision.id);
  const recent = txs.slice(0, 4);

  return (
    <div className="overview-panel">
      {(codeMissing || codeChanged) && (
        <div className={codeMissing ? "notice danger" : "notice warning"}>
          <TriangleAlert size={17} />
          <div>
            <strong>
              {codeMissing
                ? "No code at this address now"
                : "Deployed code hash changed"}
            </strong>
            <p>
              {codeMissing
                ? `The address has no bytecode on ${chainName(binding.chainId)}. It may have been self-destructed or the binding may use the wrong chain.`
                : "The bytecode at this address no longer matches the snapshot saved with this binding. The ABI may be stale."}
            </p>
            {!codeMissing && (
              <Button size="sm" variant="secondary" onClick={onUpdateSnapshot}>
                Update code snapshot
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="overview-grid">
        <section className="overview-card interface-card">
          <div className="overview-card-heading">
            <span className="overview-icon teal">
              <Braces size={17} />
            </span>
            <div>
              <p className="eyebrow">INTERFACE</p>
              <h2>ABI identity</h2>
            </div>
            <Badge tone="teal" mono>
              rev {Math.max(0, revisionIndex) + 1}/{revisions.length}
            </Badge>
          </div>

          <div className="hash-block">
            <Hash size={13} />
            <span className="hash-label">ABI hash</span>
            <span className="mono hash-value" title={revision.hash}>
              {revision.hash}
            </span>
            <CopyButton value={revision.hash} label="Copy ABI hash" compact />
          </div>

          <dl className="kv-list">
            <div>
              <dt>Source</dt>
              <dd>{sourceLabel(revision.source)}</dd>
            </div>
            <div>
              <dt>Imported</dt>
              <dd>{absoluteTime(revision.createdAt)}</dd>
            </div>
          </dl>

          {revision.warnings.length > 0 && (
            <div className="mini-warning">
              <ShieldAlert size={14} />
              <span>
                {revision.warnings.length} import note
                {revision.warnings.length === 1 ? "" : "s"} — view them in the
                ABI tab.
              </span>
            </div>
          )}
        </section>

        <section className="overview-card code-card">
          <div className="overview-card-heading">
            <span className="overview-icon blue">
              <FileCode2 size={17} />
            </span>
            <div>
              <p className="eyebrow">DEPLOYMENT</p>
              <h2>Deployed code</h2>
            </div>
            <Badge
              tone={codeMissing ? "red" : codeInfo?.codeSize ? "green" : "muted"}
            >
              {codeLoading
                ? "Checking"
                : codeMissing
                  ? "Missing"
                  : codeInfo?.codeSize
                    ? "Present"
                    : "Unknown"}
            </Badge>
          </div>

          <div className="chain-line">
            <ChainBadge chainId={binding.chainId} />
            <span className="mono address-text">{binding.address}</span>
            <CopyButton value={binding.address} label="Copy address" compact />
          </div>

          {codeError ? (
            <p className="check-line warning">
              <ShieldAlert size={14} /> {errorMessage(codeError)}
            </p>
          ) : (
            <dl className="kv-list">
              <div>
                <dt>Code size</dt>
                <dd className="mono">
                  {codeInfo ? `${codeInfo.codeSize} bytes` : "—"}
                </dd>
              </div>
              <div>
                <dt>Code hash</dt>
                <dd className="mono hash-inline">
                  {codeInfo ? (
                    <span title={codeInfo.codeHash}>
                      {shortHash(codeInfo.codeHash, 7)}
                    </span>
                  ) : (
                    "—"
                  )}
                  {codeInfo && (
                    <CopyButton
                      value={codeInfo.codeHash}
                      label="Copy code hash"
                      compact
                    />
                  )}
                </dd>
              </div>
              <div>
                <dt>Proxy</dt>
                <dd>
                  {codeInfo?.proxy ? (
                    <>
                      <Badge tone="amber">{proxyLabel(codeInfo.proxy)}</Badge>
                      {"implementation" in codeInfo.proxy &&
                        codeInfo.proxy.implementation && (
                          <span
                            className="mono"
                            title={`Proxy implementation ${codeInfo.proxy.implementation}`}
                          >
                            impl {shortHash(codeInfo.proxy.implementation, 5)}
                          </span>
                        )}
                    </>
                  ) : (
                    <span className="muted">None detected</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Checked</dt>
                <dd>
                  {codeInfo ? relativeTime(codeInfo.checkedAt) : "Not checked"}
                </dd>
              </div>
            </dl>
          )}

          <div className="card-actions">
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={13} />}
              loading={codeLoading}
              onClick={onRecheck}
            >
              Re-check
            </Button>
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
          </div>
        </section>

        <section className="overview-card activity-card">
          <div className="overview-card-heading">
            <span className="overview-icon amber">
              <Activity size={17} />
            </span>
            <div>
              <p className="eyebrow">LOCAL ACTIVITY</p>
              <h2>Transactions</h2>
            </div>
          </div>

          <div className="activity-metrics">
            <div>
              <strong>{confirmed}</strong>
              <span>Confirmed</span>
            </div>
            <div>
              <strong>{txs.length}</strong>
              <span>Recorded</span>
            </div>
            <div>
              <strong>{pending}</strong>
              <span>Pending</span>
            </div>
          </div>

          {recent.length > 0 ? (
            <div className="recent-tx-list">
              {recent.map((tx) => (
                <div key={tx.id} className="recent-tx">
                  <span
                    className={`tx-dot tx-${tx.status}`}
                    aria-hidden="true"
                  />
                  <div>
                    <strong className="mono">
                      {tx.signature.split("(")[0]}
                    </strong>
                    <small>
                      {relativeTime(tx.createdAt)} ·{" "}
                      {tx.status.replace("-", " ")}
                    </small>
                  </div>
                  {tx.hash &&
                    (explorerTxUrl(tx.chainId, tx.hash) ? (
                      <a
                        href={explorerTxUrl(tx.chainId, tx.hash)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open transaction in explorer"
                      >
                        <ArrowUpRight size={13} />
                      </a>
                    ) : (
                      <span className="mono">{shortHash(tx.hash, 4)}</span>
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-inline">
              <Clock3 size={14} /> Writes sent from this console will appear
              here.
            </p>
          )}

          {txs.length > 0 && (
            <div className="card-actions">
              <Link
                to={`/contract/${binding.chainId}/${binding.address}/transactions`}
                className="text-link"
              >
                View full history <ArrowUpRight size={12} />
              </Link>
            </div>
          )}
        </section>

        <section className="overview-card security-card">
          <div className="overview-card-heading">
            <span className="overview-icon green">
              <ShieldCheck size={17} />
            </span>
            <div>
              <p className="eyebrow">TRUST BOUNDARY</p>
              <h2>What this console can prove</h2>
            </div>
          </div>
          <div className="security-columns">
            <div>
              <h3>
                <CheckCircle2 size={14} /> Verified locally
              </h3>
              <ul>
                <li>The ABI hash matches the exact JSON you imported.</li>
                <li>
                  {codeInfo?.codeSize
                    ? "Contract bytecode exists at this address."
                    : "Code presence has not been confirmed."}
                </li>
                <li>Calldata, selector, chain, and value before signing.</li>
              </ul>
            </div>
            <div>
              <h3>
                <Waves size={14} /> Not proven
              </h3>
              <ul>
                <li>The ABI matches the deployed bytecode.</li>
                <li>The contract is safe or audited.</li>
                <li>That a successful simulation cannot revert on-chain.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
