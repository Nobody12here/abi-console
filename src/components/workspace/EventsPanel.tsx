import { useMemo, useState } from "react";
import { ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { decodeEventLog, toEventSelector, type Hex } from "viem";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import {
  type AbiEventItem,
  abiEvents,
  itemSignature,
} from "@/features/abi/utils";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { createReadClient } from "@/lib/rpc";
import { explorerTxUrl } from "@/lib/chains";
import { errorMessage } from "@/features/execution/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ValueView } from "./ResultView";

type DecodedLog = {
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  args: Record<string, unknown> | undefined;
};

type QueryState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "done";
      logs: DecodedLog[];
      from: bigint;
      to: bigint;
      fetched: number;
    }
  | { status: "error"; message: string };

const DEFAULT_RANGE = 999n;
const MAX_RANGE = 50_000n;
const MAX_LOGS = 200;
const LOG_PAGE = 25;

function parseBlock(value: string): bigint | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

export function EventsPanel({
  contract,
  revision,
}: {
  contract: ContractBinding;
  revision: AbiRevision;
}) {
  const { settings } = useWorkspace();
  const events = useMemo(() => abiEvents(revision.abi), [revision.abi]);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [ranges, setRanges] = useState<
    Record<string, { from: string; to: string }>
  >({});
  const [queries, setQueries] = useState<Record<string, QueryState>>({});
  const [visibleLogs, setVisibleLogs] = useState<Record<string, number>>({});

  if (events.length === 0) {
    return (
      <EmptyState
        title="No events in this ABI"
        description="The contract may still emit events, but this ABI doesn’t describe them, so they can’t be decoded."
      />
    );
  }

  const setRange = (signature: string, key: "from" | "to", value: string) => {
    setRanges((current) => ({
      ...current,
      [signature]: {
        from: current[signature]?.from ?? "",
        to: current[signature]?.to ?? "",
        [key]: value,
      },
    }));
  };

  const setQuery = (signature: string, state: QueryState) =>
    setQueries((current) => ({ ...current, [signature]: state }));

  const runQuery = async (event: AbiEventItem) => {
    const signature = itemSignature(event);
    const range = ranges[signature] ?? { from: "", to: "" };
    const fromInput = parseBlock(range.from);
    const toInput = parseBlock(range.to);
    if (fromInput === null || toInput === null) {
      setQuery(signature, {
        status: "error",
        message: "Block numbers must be whole numbers.",
      });
      return;
    }

    setQuery(signature, { status: "loading" });
    setVisibleLogs((current) => ({ ...current, [signature]: LOG_PAGE }));

    try {
      const client = createReadClient(contract.chainId, settings.rpcOverrides);
      // Empty "to" means the latest block; empty "from" means the 1,000 blocks before it.
      const to = toInput ?? (await client.getBlockNumber());
      const from =
        fromInput ?? (to > DEFAULT_RANGE ? to - DEFAULT_RANGE : 0n);

      if (from > to) {
        setQuery(signature, {
          status: "error",
          message: "“From” must not be after “To”.",
        });
        return;
      }
      if (to - from > MAX_RANGE) {
        setQuery(signature, {
          status: "error",
          message: `Search at most ${MAX_RANGE.toLocaleString()} blocks at a time.`,
        });
        return;
      }

      const rawLogs = (await client.getLogs({
        address: contract.address,
        fromBlock: from,
        toBlock: to,
        topics: [toEventSelector(event)],
      } as never)) as Array<{
        blockNumber: bigint;
        transactionHash: Hex;
        logIndex: number;
        data: Hex;
        topics: readonly Hex[];
      }>;

      const logs: DecodedLog[] = [];
      // Newest first is what people usually want to see.
      for (const log of rawLogs.slice(-MAX_LOGS).reverse()) {
        try {
          const decoded = decodeEventLog({
            abi: revision.abi,
            data: log.data,
            topics: log.topics,
          } as never) as { args?: Record<string, unknown> };
          logs.push({
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
            args: decoded.args,
          });
        } catch {
          // A log with this topic may still fail to decode if the ABI is stale.
        }
      }

      setQuery(signature, {
        status: "done",
        logs,
        from,
        to,
        fetched: rawLogs.length,
      });
    } catch (error) {
      setQuery(signature, { status: "error", message: errorMessage(error) });
    }
  };

  return (
    <div className="events-panel">
      <p className="muted panel-intro">
        Open an event to search its logs. Nothing is fetched until you click
        “Get logs”.
      </p>

      <div className="method-stack">
        {events.map((event) => {
          const signature = itemSignature(event);
          const topic0 = toEventSelector(event);
          const expanded = openEvent === signature;
          const range = ranges[signature] ?? { from: "", to: "" };
          const query = queries[signature] ?? { status: "idle" };
          const shown =
            query.status === "done"
              ? Math.min(visibleLogs[signature] ?? LOG_PAGE, query.logs.length)
              : 0;
          const bodyId = `event-${topic0}`;

          return (
            <article key={signature} className={cn("method", expanded && "is-open")}>
              <button
                type="button"
                className="method-toggle"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() =>
                  setOpenEvent((current) =>
                    current === signature ? null : signature,
                  )
                }
              >
                <ChevronRight
                  size={14}
                  className={cn("chevron", expanded && "rotate")}
                  aria-hidden="true"
                />
                <span className="method-ident mono">
                  <span className="method-name">{event.name}</span>
                  <span className="method-params">
                    (
                    {event.inputs
                      .map(
                        (input) =>
                          `${input.type}${input.indexed ? " indexed" : ""}${input.name ? ` ${input.name}` : ""}`,
                      )
                      .join(", ")}
                    )
                  </span>
                </span>
                {event.anonymous && <span className="tag tag-neutral">anonymous</span>}
              </button>

              {expanded && (
                <div className="method-body" id={bodyId}>
                  <div className="advanced-row">
                    <span className="advanced-label">Topic 0</span>
                    <code className="mono break">{topic0}</code>
                    <CopyButton value={topic0} label="Copy topic" compact />
                  </div>

                  {event.anonymous ? (
                    <p className="status-line muted">
                      Anonymous events have no topic to search by, so their logs
                      can’t be listed here.
                    </p>
                  ) : (
                    <>
                      <div className="event-query">
                        <label className="field-group">
                          <span className="field-label">From block</span>
                          <input
                            className="field mono"
                            value={range.from}
                            onChange={(event_) =>
                              setRange(signature, "from", event_.target.value)
                            }
                            placeholder="latest − 1000"
                            inputMode="numeric"
                            spellCheck={false}
                          />
                        </label>
                        <label className="field-group">
                          <span className="field-label">To block</span>
                          <input
                            className="field mono"
                            value={range.to}
                            onChange={(event_) =>
                              setRange(signature, "to", event_.target.value)
                            }
                            placeholder="latest"
                            inputMode="numeric"
                            spellCheck={false}
                          />
                        </label>
                        <Button
                          variant="primary"
                          loading={query.status === "loading"}
                          onClick={() => void runQuery(event)}
                        >
                          Get logs
                        </Button>
                      </div>
                      <p className="hint">
                        Leave both empty to search the last 1,000 blocks.
                      </p>
                    </>
                  )}

                  {query.status === "error" && (
                    <p className="status-line danger" role="alert">
                      {query.message}
                    </p>
                  )}

                  {query.status === "loading" && (
                    <p className="hint">
                      <Loader2 size={13} className="spin" /> Fetching logs…
                    </p>
                  )}

                  {query.status === "done" && (
                    <div className="event-results">
                      <p className="muted">
                        {query.logs.length === 0
                          ? "No logs"
                          : `${query.logs.length} log${query.logs.length === 1 ? "" : "s"}`}{" "}
                        in blocks {query.from.toString()}–{query.to.toString()}
                      </p>

                      {query.logs.length > 0 && (
                        <div className="event-logs">
                          {query.logs.slice(0, shown).map((log) => {
                            const explorer = explorerTxUrl(
                              contract.chainId,
                              log.transactionHash,
                            );
                            return (
                              <div
                                key={`${log.transactionHash}:${log.logIndex}`}
                                className="event-log"
                              >
                                <div className="event-log-head">
                                  <span>Block {log.blockNumber.toString()}</span>
                                  {explorer ? (
                                    <a
                                      className="text-link mono"
                                      href={explorer}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {log.transactionHash.slice(0, 10)}…{" "}
                                      <ExternalLink size={11} />
                                    </a>
                                  ) : (
                                    <span className="mono">
                                      {log.transactionHash.slice(0, 10)}…
                                    </span>
                                  )}
                                </div>
                                {log.args && (
                                  <dl className="result-tuple">
                                    {Object.entries(log.args).map(([key, value]) => (
                                      <div key={key}>
                                        <dt className="mono">{key}</dt>
                                        <dd>
                                          <ValueView value={value} />
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {query.logs.length > shown && (
                        <Button
                          size="sm"
                          onClick={() =>
                            setVisibleLogs((current) => ({
                              ...current,
                              [signature]: Math.min(
                                shown + LOG_PAGE,
                                query.logs.length,
                              ),
                            }))
                          }
                        >
                          Show more ({query.logs.length - shown} left)
                        </Button>
                      )}

                      {query.fetched > MAX_LOGS ? (
                        <p className="hint">
                          Found {query.fetched.toLocaleString()} logs; showing
                          the newest {MAX_LOGS}. Narrow the block range to see
                          the rest.
                        </p>
                      ) : query.logs.length < query.fetched ? (
                        <p className="hint">
                          {query.fetched - query.logs.length} of {query.fetched}{" "}
                          logs couldn’t be decoded with this ABI.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
