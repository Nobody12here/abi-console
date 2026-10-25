import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Braces,
  Check,
  ChevronRight,
  Download,
  FilePenLine,
  Hash,
  History,
  Search,
} from "lucide-react";
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
import { Badge } from "@/components/ui/Badge";
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
  const [saving, setSaving] = useState(false);

  const groups = useMemo<Group[]>(() => {
    const needle = filter.trim().toLowerCase();
    const matching = revision.abi.filter((item) => {
      if (!needle) return true;
      const signature = itemSignature(item).toLowerCase();
      return (
        signature.includes(needle) ||
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

  const activeIndex = orderedRevisions.findIndex(
    (entry) => entry.id === revision.id,
  );

  const saveRevision = () => {
    setIssues([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setIssues(["That is not valid JSON. Check for missing braces or commas."]);
      return;
    }

    setSaving(true);
    try {
      const imported = normalizeAbi(parsed);
      const created = createRevision(imported, { kind: "paste" });
      setActiveRevision(contract.id, created.id);
      setEditing(false);
      toast.success(
        created.id === revision.id
          ? "That ABI is already the active revision."
          : "New ABI revision saved and activated.",
      );
    } catch (error) {
      if (error instanceof AbiValidationError) {
        setIssues(error.issues);
      } else {
        setIssues([errorMessage(error)]);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="abi-panel">
      <section className="abi-identity">
        <div className="abi-identity-heading">
          <div>
            <p className="eyebrow">ACTIVE ABI</p>
            <h2>
              Revision {Math.max(0, activeIndex) + 1} of{" "}
              {orderedRevisions.length}
            </h2>
          </div>
        </div>

        <div className="hash-block">
          <Hash size={13} />
          <span className="hash-label">ABI hash</span>
          <span className="mono hash-value" title={revision.hash}>
            {revision.hash}
          </span>
          <CopyButton value={revision.hash} label="Copy ABI hash" compact />
        </div>

        <div className="abi-meta-strip">
          <span>
            Source <strong>{sourceLabel(revision.source)}</strong>
          </span>
          <span>Imported {absoluteTime(revision.createdAt)}</span>
        </div>

        {revision.warnings.length > 0 && (
          <div className="warning-list">
            <p className="eyebrow">IMPORT NOTES</p>
            {revision.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}

        <div className="abi-identity-actions">
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={13} />}
            onClick={() =>
              downloadText(
                toJson(revision.raw),
                `${contract.name.replace(/[^\w.-]+/g, "-")}-abi-${shortHash(revision.hash, 4)}.json`,
              )
            }
          >
            Download raw ABI
          </Button>
          <Button
            variant={editing ? "ghost" : "secondary"}
            size="sm"
            icon={<FilePenLine size={13} />}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "Close editor" : "Edit raw ABI"}
          </Button>
        </div>
      </section>

      {editing && (
        <section className="abi-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RAW ABI EDITOR</p>
              <h2>Create a new revision</h2>
            </div>
            <Badge tone="amber">Immutable history</Badge>
          </div>
          <p className="hint">
            Editing this JSON validates a new ABI, computes a new hash, stores it
            as a new revision, and activates it for this contract. The current
            revision stays available below.
          </p>
          <textarea
            className={cn("field mono textarea", issues.length > 0 && "invalid")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            aria-label="Raw ABI JSON"
          />
          {issues.length > 0 && (
            <div className="issue-box" role="alert">
              <span className="issue-icon">
                <AlertTriangle size={16} />
              </span>
              <div>
                <strong>
                  {issues.length === 1 ? "1 validation issue" : `${issues.length} validation issues`}
                </strong>
                <ul>
                  {issues.slice(0, 6).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="abi-editor-actions">
            <Button
              variant="primary"
              icon={<Check size={14} />}
              loading={saving}
              onClick={saveRevision}
            >
              Validate &amp; save revision
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(toJson(revision.raw));
                setIssues([]);
              }}
            >
              Reset to active
            </Button>
          </div>
        </section>
      )}

      <section className="abi-tree">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">INTERFACE TREE</p>
            <h2>Every ABI item</h2>
          </div>
          <label className="search-field compact-search">
            <Search size={13} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter items"
              aria-label="Filter ABI items"
              spellCheck={false}
            />
          </label>
        </div>

        {groups.length === 0 ? (
          <p className="empty-inline">
            <Braces size={14} /> No items match “{filter}”.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="abi-group">
              <div className="abi-group-heading">
                <span>{group.label}</span>
                <span className="mono">{group.items.length}</span>
              </div>
              {group.items.map((item, index) => {
                const signature = itemSignature(item);
                return (
                  <details
                    key={`${group.id}:${signature}:${index}`}
                    className="abi-item"
                  >
                    <summary>
                      <ChevronRight size={13} className="abi-chevron" />
                      <span className="mono abi-item-signature">
                        {signature}
                      </span>
                      <span className="abi-item-type">{item.type}</span>
                      <CopyButton
                        value={signature}
                        label="Copy signature"
                        compact
                      />
                    </summary>
                    <pre className="abi-item-json mono">
                      {toJson(item)}
                    </pre>
                  </details>
                );
              })}
            </div>
          ))
        )}
      </section>

      {orderedRevisions.length > 1 && (
        <section className="abi-revisions">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LOCAL HISTORY</p>
              <h2>ABI revisions</h2>
            </div>
            <Badge tone="muted">
              <History size={11} /> {orderedRevisions.length} stored
            </Badge>
          </div>
          <p className="hint">
            Revisions are immutable. Activating one changes the interface used for
            reads, writes, and log decoding without deleting any previous version.
          </p>

          <div className="revision-list">
            {orderedRevisions.map((entry) => {
              const active = entry.id === revision.id;
              const entrySignatures = new Set(signaturesOf(entry.abi));
              const added = active
                ? []
                : signaturesOf(entry.abi).filter(
                    (signature) => !activeSignatures.has(signature),
                  );
              const removed = active
                ? []
                : signaturesOf(revision.abi).filter(
                    (signature) => !entrySignatures.has(signature),
                  );

              return (
                <article
                  key={entry.id}
                  className={cn("revision-card", active && "is-active")}
                >
                  <div className="revision-head">
                    <div>
                      <span className="revision-source">
                        {sourceLabel(entry.source)}
                      </span>
                      <span className="hint">
                        {absoluteTime(entry.createdAt)}
                      </span>
                    </div>
                    {active ? (
                      <Badge tone="green">
                        <Check size={11} /> Active
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setActiveRevision(contract.id, entry.id);
                          toast.success("ABI revision activated.");
                        }}
                      >
                        Activate
                      </Button>
                    )}
                  </div>

                  <div className="revision-meta mono">
                    <span>{plural(entry.counts.functions, "function")}</span>
                    <span>{plural(entry.counts.events, "event")}</span>
                    <span>{plural(entry.counts.errors, "error")}</span>
                  </div>

                  {(added.length > 0 || removed.length > 0) && (
                    <div className="revision-diff">
                      {added.length > 0 && (
                        <div>
                          <span className="diff-label added">+ added vs active</span>
                          <div className="diff-chips">
                            {added.slice(0, 6).map((signature) => (
                              <code key={signature} className="mono">
                                {signature}
                              </code>
                            ))}
                            {added.length > 6 && (
                              <span className="hint">+{added.length - 6} more</span>
                            )}
                          </div>
                        </div>
                      )}
                      {removed.length > 0 && (
                        <div>
                          <span className="diff-label removed">− removed vs active</span>
                          <div className="diff-chips">
                            {removed.slice(0, 6).map((signature) => (
                              <code key={signature} className="mono">
                                {signature}
                              </code>
                            ))}
                            {removed.length > 6 && (
                              <span className="hint">+{removed.length - 6} more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="revision-foot">
                    <span className="hash-label">ABI hash</span>
                    <code className="mono" title={entry.hash}>
                      {entry.hash}
                    </code>
                    <CopyButton value={entry.hash} label="Copy ABI hash" compact />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
