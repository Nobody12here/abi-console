import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type {
  AbiRevision,
  CodeInfo,
  ContractBinding,
} from "@/features/abi/types";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { sourceLabel } from "@/features/abi/source";
import { proxyLabel } from "@/features/abi/utils";
import { errorMessage } from "@/features/execution/errors";
import { absoluteTime, relativeTime, shortHash } from "@/lib/format";
import { chainName } from "@/lib/chains";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function DetailsPanel({
  binding,
  revision,
  revisions,
  codeInfo,
  codeLoading,
  codeError,
  onRecheck,
}: {
  binding: ContractBinding;
  revision: AbiRevision;
  revisions: AbiRevision[];
  codeInfo: CodeInfo | undefined;
  codeLoading: boolean;
  codeError: unknown;
  onRecheck: () => void;
}) {
  const proxy = codeInfo?.proxy;

  return (
    <div className="details-panel">
      <section className="section">
        <div className="section-heading">
          <h2>Contract</h2>
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={13} />}
            loading={codeLoading}
            onClick={onRecheck}
          >
            Check again
          </Button>
        </div>
        {codeError ? (
          <p className="status-line warning">{errorMessage(codeError)}</p>
        ) : null}
        <dl className="kv">
          <Row label="Address">
            <span className="mono break">{binding.address}</span>
            <CopyButton value={binding.address} label="Copy address" compact />
          </Row>
          <Row label="Network">
            {chainName(binding.chainId)}{" "}
            <span className="muted">(chain ID {binding.chainId})</span>
          </Row>
          <Row label="Code size">
            {codeInfo ? `${codeInfo.codeSize.toLocaleString()} bytes` : "—"}
          </Row>
          <Row label="Code hash">
            {codeInfo ? (
              <>
                <span className="mono">{shortHash(codeInfo.codeHash, 8)}</span>
                <CopyButton value={codeInfo.codeHash} label="Copy code hash" compact />
              </>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Proxy">
            {proxy ? (
              <>
                {proxyLabel(proxy)}
                {"implementation" in proxy && proxy.implementation && (
                  <>
                    {" → "}
                    <span className="mono">{proxy.implementation}</span>
                    <CopyButton
                      value={proxy.implementation}
                      label="Copy implementation address"
                      compact
                    />
                  </>
                )}
              </>
            ) : (
              <span className="muted">None detected</span>
            )}
          </Row>
          <Row label="Last checked">
            {codeInfo ? relativeTime(codeInfo.checkedAt) : "—"}
          </Row>
        </dl>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>ABI</h2>
        </div>
        <dl className="kv">
          <Row label="Source">{sourceLabel(revision.source)}</Row>
          <Row label="Added">{absoluteTime(revision.createdAt)}</Row>
          <Row label="Contents">
            {revision.counts.readFunctions} read, {revision.counts.writeFunctions}{" "}
            write, {revision.counts.events} events, {revision.counts.errors} errors
          </Row>
          <Row label="ABI hash">
            <span className="mono">{shortHash(revision.hash, 8)}</span>
            <CopyButton value={revision.hash} label="Copy ABI hash" compact />
          </Row>
          <Row label="Versions">
            {revisions.length} saved{revisions.length > 1 && " (manage in the ABI tab)"}
          </Row>
        </dl>
        <p className="hint">
          The ABI hash identifies the exact JSON you imported. It doesn’t prove
          the ABI matches the deployed code, so check the selector and calldata
          before you sign.
        </p>
      </section>
    </div>
  );
}
