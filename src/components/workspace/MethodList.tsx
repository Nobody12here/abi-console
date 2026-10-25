import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import type { Abi, Address } from "viem";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import {
  type AbiFunctionItem,
  functionSignature,
  functionSelector,
  searchFunction,
} from "@/features/abi/utils";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { createReadClient } from "@/lib/rpc";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MethodCard, type MethodPreview } from "./MethodCard";

/** How many argument-free view functions are read automatically. */
const MAX_AUTO_READS = 40;
const AUTO_READ_CONCURRENCY = 6;

type AutoReadResult = Record<string, { ok: true; value: unknown } | { ok: false }>;

export function MethodList({
  contract,
  revision,
  functions,
  mode,
}: {
  contract: ContractBinding;
  revision: AbiRevision;
  functions: AbiFunctionItem[];
  mode: "read" | "write";
}) {
  const { settings } = useWorkspace();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Argument-free reads first (they show a value inline), keeping ABI order otherwise.
  const ordered = useMemo(() => {
    if (mode !== "read") return functions;
    const simple = functions.filter((fn) => fn.inputs.length === 0);
    const rest = functions.filter((fn) => fn.inputs.length > 0);
    return [...simple, ...rest];
  }, [functions, mode]);

  const autoRead = useMemo(
    () =>
      mode === "read"
        ? ordered.filter((fn) => fn.inputs.length === 0).slice(0, MAX_AUTO_READS)
        : [],
    [ordered, mode],
  );

  const previews = useQuery({
    queryKey: [
      "auto-read",
      contract.chainId,
      contract.address,
      revision.id,
      settings.rpcOverrides[contract.chainId] ?? "",
    ],
    enabled: autoRead.length > 0,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const client = createReadClient(contract.chainId, settings.rpcOverrides);
      const results: AutoReadResult = {};
      const queue = [...autoRead];
      // Small batches keep public RPCs from rate-limiting us.
      while (queue.length > 0) {
        const batch = queue.splice(0, AUTO_READ_CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map((fn) =>
            client.readContract({
              address: contract.address as Address,
              abi: [fn] as Abi,
              functionName: fn.name,
              args: [],
            } as never),
          ),
        );
        settled.forEach((outcome, index) => {
          results[functionSignature(batch[index])] =
            outcome.status === "fulfilled"
              ? { ok: true, value: outcome.value }
              : { ok: false };
        });
      }
      return results;
    },
  });

  const previewFor = (fn: AbiFunctionItem): MethodPreview | undefined => {
    if (!autoRead.includes(fn)) return undefined;
    if (previews.isError) return { status: "error" };
    const entry = previews.data?.[functionSignature(fn)];
    if (!entry) return { status: "loading" };
    return entry.ok ? { status: "ok", value: entry.value } : { status: "error" };
  };

  const filtered = useMemo(
    () => ordered.filter((fn) => searchFunction(fn, query)),
    [ordered, query],
  );

  if (functions.length === 0) {
    return (
      <EmptyState
        title={
          mode === "read"
            ? "No read functions"
            : "No write functions"
        }
        description={
          mode === "read"
            ? "This ABI has no view or pure functions."
            : "This ABI has no functions that change state."
        }
      />
    );
  }

  return (
    <div className="method-list">
      <div className="toolbar">
        {functions.length > 6 && (
          <label className="search-field">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name or selector"
              aria-label={`Filter ${mode} functions`}
              spellCheck={false}
            />
          </label>
        )}
        <span className="muted toolbar-count">
          {query
            ? `${filtered.length} of ${functions.length}`
            : `${functions.length} function${functions.length === 1 ? "" : "s"}`}
        </span>
        {autoRead.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={13} />}
            loading={previews.isFetching}
            onClick={() => void previews.refetch()}
          >
            Refresh values
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="no-results">
          <p>No functions match “{query}”.</p>
          <button type="button" className="text-link" onClick={() => setQuery("")}>
            Clear filter
          </button>
        </div>
      ) : (
        <div className="method-stack">
          {filtered.map((fn) => {
            const signature = functionSignature(fn);
            return (
              <MethodCard
                key={`${signature}:${functionSelector(fn)}`}
                contract={contract}
                revision={revision}
                fn={fn}
                mode={mode}
                preview={previewFor(fn)}
                open={expanded === signature}
                onToggle={() =>
                  setExpanded((current) =>
                    current === signature ? null : signature,
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
