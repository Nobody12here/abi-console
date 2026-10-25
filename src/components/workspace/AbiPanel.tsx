import { useMemo, useState } from "react";
import { ChevronRight, Download, Pencil, Search } from "lucide-react";
import toast from "react-hot-toast";
import type { Abi } from "viem";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import {
  AbiValidationError,
  normalizeAbi,
} from "@/features/abi/normalize";
import {
  itemLabel,
  itemSignature,
} from "@/features/abi/utils";
import { sourceLabel } from "@/features/abi/source";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { errorMessage } from "@/features/execution/errors";
import {
  absoluteTime,
  downloadText,
  plural,
  shortHash,
  toJson,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";

type Group = {
  id: string;
  label: string;
  items: Abi[number][];
};

const GROUP_ORDER: Array<{ id: string; label: string; types: string[] }> = [
  { id: "functions", label: "Functions", types: ["function"] },
  { id: "events", label: "Events", types: ["event"] },
  { id: "errors", label: "Errors", types: ["error"] },
  {
    id: "special",
    label: "Constructor, fallback, receive",
    types: ["constructor", "fallback", "receive"],
  },
];

function signaturesOf(abi: Abi | readonly unknown[]): string[] {
  return (abi as Abi).map((item) => itemSignature(item));
}

export function AbiPanel({
  contract,
  revision,
  revisions,
}: {
  contract: ContractBinding;
  revision: AbiRevision;
  revisions: AbiRevision[];
}) {
  const { createRevision, setActiveRevision } = useWorkspace();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toJson(revision.raw));
  const [issues, setIssues] = useState<string[]>([]);

  const groups = useMemo<Group[]>(() => {
    const needle = filter.trim().toLowerCase();
    const matching = revision.abi.filter((item) => {
      if (!needle) return true;
      return (
        itemSignature(item).toLowerCase().includes(needle) ||
        item.type.includes(needle) ||
        itemLabel(item).toLowerCase().includes(needle)
      );
    });

    return GROUP_ORDER.map((group) => ({
      id: group.id,
      label: group.label,
      items: matching.filter((item) => group.types.includes(item.type)),
    })).filter((group) => group.items.length > 0);
  }, [filter, revision.abi]);

  const activeSignatures = useMemo(
    () => new Set(signaturesOf(revision.abi)),
    [revision.abi],
  );

  const orderedRevisions = useMemo(
    () =>
      [...revisions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [revisions],
  );

  const saveRevision = () => {
    setIssues([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setIssues(["That is not valid JSON."]);
      return;
    }

    try {
      const imported = normalizeAbi(parsed);
      const created = createRevision(imported, { kind: "paste" });
      setActiveRevision(contract.id, created.id);
      setEditing(false);
      toast.success(
        created.id === revision.id
          ? "No changes to save."
          : "Saved as a new ABI version.",
      );
    } catch (error) {
      setIssues(
        error instanceof AbiValidationError ? error.issues : [errorMessage(error)],
      );
    }
  };

  return (
    <div className="abi-panel">
      <div className="toolbar">
        <span className="muted toolbar-count">
          {sourceLabel(revision.source)} · added {absoluteTime(revision.createdAt)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={<Download size={13} />}
          onClick={() =>
            downloadText(
              toJson(revision.raw),
              `${contract.name.replace(/[^\w.-]+/g, "-")}-abi.json`,
            )
          }
        >
          Download JSON
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Pencil size={13} />}
          onClick={() => {
            if (!editing) setDraft(toJson(revision.raw));
            setIssues([]);
            setEditing((value) => !value);
          }}
        >
          {editing ? "Close editor" : "Edit JSON"}
        </Button>
      </div>

      {revision.warnings.length > 0 && (
        <div className="notice info">
          <div>
            <strong>Import notes</strong>
            <ul className="plain-list">
              {revision.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {editing && (
        <section className="section">
          <p className="hint">
            Saving creates a new ABI version and switches to it. The current
            version stays in the list below, so you can switch back.
          </p>
          <textarea
            className={cn("field mono textarea tall", issues.length > 0 && "invalid")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            aria-label="ABI JSON"
          />
          {issues.length > 0 && (
            <div className="status-line danger" role="alert">
              <ul className="plain-list">
                {issues.slice(0, 6).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="button-row">
            <Button variant="primary" onClick={saveRevision}>
              Save as new version
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-heading">
          <h2>Items</h2>
          <label className="search-field compact">
            <Search size={13} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter"
              aria-label="Filter ABI items"
              spellCheck={false}
            />
          </label>
        </div>

        {groups.length === 0 ? (
          <p className="muted">No items match “{filter}”.</p>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="abi-group">
              <h3 className="abi-group-heading">
                {group.label} <span className="muted">{group.items.length}</span>
              </h3>
              <div className="table">
                {group.items.map((item, index) => {
                  const signature = itemSignature(item);
                  return (
                    <details
                      key={`${group.id}:${signature}:${index}`}
                      className="abi-item"
                    >
                      <summary>
                        <ChevronRight size={13} className="chevron" />
                        <span className="mono break">{signature}</span>
                        <CopyButton value={signature} label="Copy signature" compact />
                      </summary>
                      <pre className="mono code-block">{toJson(item)}</pre>
                    </details>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Versions</h2>
        </div>
        <p className="hint">
          Each time you replace or edit the ABI, the old version is kept. Switch
          versions here.
        </p>
        <div className="table">
          {orderedRevisions.map((entry) => {
            const active = entry.id === revision.id;
            const entrySignatures = new Set(signaturesOf(entry.abi));
            const added = active
              ? []
              : signaturesOf(entry.abi).filter((sig) => !activeSignatures.has(sig));
            const removed = active
              ? []
              : signaturesOf(revision.abi).filter((sig) => !entrySignatures.has(sig));

            return (
              <div key={entry.id} className={cn("revision-row", active && "is-active")}>
                <div className="revision-main">
                  <div>
                    <strong>{sourceLabel(entry.source)}</strong>
                    <span className="muted">
                      {" "}· {absoluteTime(entry.createdAt)} ·{" "}
                      {plural(entry.counts.functions, "function")}
                    </span>
                    <div className="muted mono revision-hash" title={entry.hash}>
                      {shortHash(entry.hash, 8)}
                    </div>
                  </div>
                  {active ? (
                    <span className="tag tag-green">In use</span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        setActiveRevision(contract.id, entry.id);
                        toast.success("Switched ABI version.");
                      }}
                    >
                      Use this version
                    </Button>
                  )}
                </div>

                {(added.length > 0 || removed.length > 0) && (
                  <div className="revision-diff mono">
                    <div className="muted">Compared with the version in use:</div>
                    {added.slice(0, 5).map((sig) => (
                      <div key={`+${sig}`} className="diff-added">+ {sig}</div>
                    ))}
                    {removed.slice(0, 5).map((sig) => (
                      <div key={`-${sig}`} className="diff-removed">− {sig}</div>
                    ))}
                    {added.length + removed.length > 10 && (
                      <div className="muted">…and more</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
