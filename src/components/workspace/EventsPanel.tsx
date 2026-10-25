import { useMemo, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  ListFilter,
  Loader2,
  Radio,
  SearchX,
  Waves,
} from "lucide-react";
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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ValueView } from "./ResultView";

type DecodedLog = {
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  args: Record<string, unknown> | undefined;
  topics: readonly Hex[];
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

const MAX_RANGE = 50_000n;
const MAX_LOGS = 200;
const LOG_PAGE = 25;

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
  const [rangeBusy, setRangeBusy] = useState<string | null>(null);
  const [visibleLogs, setVisibleLogs] = useState<Record<string, number>>({});

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Waves size={22} />}
        eyebrow="EVENT CATALOG"
        title="This ABI declares no events"
        description="Events can still exist in the deployed bytecode, but this ABI does not describe them. Update the ABI revision to decode logs."
      />
    );
  }

  const setRange = (
    signature: string,
    key: "from" | "to",
    value: string,
  ) => {
    setRanges((current) => ({
      ...current,
      [signature]: {
        from: current[signature]?.from ?? "",
        to: current[signature]?.to ?? "",
        [key]: value,
      },
    }));
  };

  const loadRecent = async (event: AbiEventItem) => {
    const signature = itemSignature(event);
    setRangeBusy(signature);
    try {
      const client = createReadClient(contract.chainId, settings.rpcOverrides);
      const latest = await client.getBlockNumber();
      const from = latest > 999n ? latest - 999n : 0n;
      setRanges((current) => ({
        ...current,
        [signature]: { from: from.toString(), to: latest.toString() },
      }));
    } catch (error) {
      setQueries((current) => ({
        ...current,
        [signature]: { status: "error", message: errorMessage(error) },
      }));
    } finally {
      setRangeBusy(null);
    }
  };

  const runQuery = async (event: AbiEventItem) => {
    const signature = itemSignature(event);
    const range = ranges[signature] ?? { from: "", to: "" };
    let from: bigint;
    let to: bigint;
    try {
      from = BigInt(range.from.trim() || "0");
      to = BigInt(range.to.trim());
    } catch {
      setQueries((current) => ({
        ...current,
        [signature]: {
          status: "error",
          message: "Enter numeric from/to block numbers.",
        },
      }));
      return;
    }
    if (from < 0n || to < 0n) {
      setQueries((current) => ({
        ...current,
        [signature]: {
          status: "error",
          message: "Block numbers cannot be negative.",
        },
      }));
      return;
    }
    if (from > to) {
      setQueries((current) => ({
        ...current,
        [signature]: {
          status: "error",
          message: "The from block must be lower than the to block.",
        },
      }));
      return;
    }
    if (to - from > MAX_RANGE) {
      setQueries((current) => ({
        ...current,
        [signature]: {
          status: "error",
          message: `Keep the block range under ${MAX_RANGE.toLocaleString()} blocks.`,
        },
      }));
      return;
    }

    setQueries((current) => ({
      ...current,
      [signature]: { status: "loading" },
    }));
    setVisibleLogs((current) => ({ ...current, [signature]: LOG_PAGE }));

    try {
      const client = createReadClient(contract.chainId, settings.rpcOverrides);
      const topic0 = toEventSelector(event);
      const rawLogs = (await client.getLogs({
        address: contract.address,
        fromBlock: from,
        toBlock: to,
        topics: [topic0],
      } as never)) as Array<{
        blockNumber: bigint;
        transactionHash: Hex;
        logIndex: number;
        data: Hex;
        topics: readonly Hex[];
      }>;

      const logs: DecodedLog[] = [];
      for (const log of rawLogs.slice(0, MAX_LOGS)) {
        try {
          const decoded = decodeEventLog({
            abi: revision.abi,
            data: log.data,
            topics: log.topics,
          } as never) as {
            args?: Record<string, unknown>;
          };
          logs.push({
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
            args: decoded.args,
            topics: log.topics,
          });
        } catch {
          // A log with this topic may still fail to decode if the ABI is stale.
        }
      }

      setQueries((current) => ({
        ...current,
        [signature]: {
          status: "done",
          logs,
          from,
          to,
          fetched: rawLogs.length,
        },
      }));
    } catch (error) {
      setQueries((current) => ({
        ...current,
        [signature]: {
          status: "error",
          message: errorMessage(error),
        },
      }));
    }
  };

  return (
    <div className="events-panel">
      <div className="panel-intro">
        <div>
          <p className="eyebrow">ABI EVENT CATALOG</p>
          <h2>{events.length} declared events</h2>
        </div>
        <Badge tone="muted">
          <ListFilter size={11} /> User-triggered queries
        </Badge>
      </div>

      <p className="panel-note">
        <Radio size={13} /> Nothing is fetched until you run a query. Log
        decoding uses the active ABI revision and the selected chain&apos;s RPC.
      </p>

      <div className="event-list">
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

          return (
            <article
              key={signature}
              className={cn("event-card", expanded && "is-open")}
            >
              <button
                type="button"
                className="event-card-toggle"
                aria-expanded={expanded}
                onClick={() =>
                  setOpenEvent((current) =>
                    current === signature ? null : signature,
                  )
                }
              >
                <ChevronRight
                  size={15}
                  className={cn("method-chevron", expanded && "rotate")}
                  aria-hidden="true"
                />
                <span className="event-ident">
                  <span className="method-name mono">{event.name}</span>
                  <span className="method-params mono">
                    ({event.inputs.map((input) => input.type).join(", ")})
                  </span>
                </span>
                <span className="event-meta">
                  {event.anonymous && <Badge tone="amber">Anonymous</Badge>}
                  <span className="hint">
                    {event.inputs.filter((input) => input.indexed).length} indexed
                  </span>
                  <span
                    className="method-selector mono"
                    title={`Topic 0 hash ${topic0}`}
                  >
                    topic0 {topic0.slice(0, 10)}…
                  </span>
                </span>
              </button>

              {expanded && (
                <div className="event-body">
                  <div className="event-topic">
                    <span className="eyebrow">TOPIC 0</span>
                    <code className="mono">{topic0}</code>
                    <CopyButton value={topic0} label="Copy topic 0" compact />
                  </div>

                  <div className="event-inputs">
                    {event.inputs.length === 0 ? (
                      <p className="hint">This event declares no parameters.</p>
                    ) : (
                      event.inputs.map((input, index) => (
                        <div key={index} className="event-input">
                          <span className="mono">
                            {input.name || `arg${index}`}
                          </span>
                          <em className="mono">{input.type}</em>
                          {input.indexed && (
                            <Badge tone="teal">indexed</Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="event-query">
                    <label className="block-field">
                      <span>From block</span>
                      <input
                        className="field mono compact"
                        value={range.from}
                        onChange={(event_) =>
                          setRange(signature, "from", event_.target.value)
                        }
                        placeholder="0"
                        inputMode="numeric"
                        spellCheck={false}
                      />
                    </label>
                    <label className="block-field">
                      <span>To block</span>
                      <input
                        className="field mono compact"
                        value={range.to}
                        onChange={(event_) =>
                          setRange(signature, "to", event_.target.value)
                        }
                        placeholder="latest"
                        inputMode="numeric"
                        spellCheck={false}
                      />
                    </label>
                    <div className="event-query-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={rangeBusy === signature}
                        onClick={() => void loadRecent(event)}
                      >
                        Last 1,000 blocks
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<SearchX size={13} />}
                        loading={query.status === "loading"}
                        disabled={!range.to.trim()}
                        onClick={() => void runQuery(event)}
                        title={
                          range.to.trim()
                            ? "Query logs in this block range"
                            : "Set a to block first"
                        }
                      >
                        Query logs
                      </Button>
                    </div>
                  </div>

                  {query.status === "error" && (
                    <div className="tx-note danger" role="alert">
                      {query.message}
                    </div>
                  )}

                  {query.status === "loading" && (
                    <p className="hint">
                      <Loader2 size={13} className="spin" /> Fetching logs…
                    </p>
                  )}

                  {query.status === "done" && (
                    <div className="event-results">
                      <div className="event-results-heading">
                        <span className="eyebrow">
                          {query.logs.length} log
                          {query.logs.length === 1 ? "" : "s"} decoded
                        </span>
                        <span className="hint mono">
                          {query.from.toString()} → {query.to.toString()}
                        </span>
                      </div>

                      {query.logs.length === 0 ? (
                        <p className="empty-inline">
                          No matching logs in this block range.
                        </p>
                      ) : (
                        <>
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
                                    <span className="mono">
                                      block {log.blockNumber.toString()}
                                    </span>
                                    <span className="mono">
                                      log {log.logIndex}
                                    </span>
                                    {explorer && (
                                      <a
                                        className="text-link"
                                        href={explorer}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        tx <ExternalLink size={11} />
                                      </a>
                                    )}
                                  </div>
                                  {log.args ? (
                                    <div className="event-log-args">
                                      {Object.entries(log.args).map(
                                        ([key, value]) => (
                                          <div key={key}>
                                            <span className="mono event-log-key">
                                              {key}
                                            </span>
                                            <ValueView value={value} />
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  ) : (
                                    <p className="hint">
                                      This log could not be decoded with the
                                      active ABI.
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {query.logs.length > shown && (
                            <div className="event-logs-more">
                              <span className="hint">
                                Showing {shown} of {query.logs.length}
                              </span>
                              <Button
                                size="sm"
                                variant="secondary"
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
                                Show{" "}
                                {Math.min(
                                  LOG_PAGE,
                                  query.logs.length - shown,
                                )}{" "}
                                more
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setVisibleLogs((current) => ({
                                    ...current,
                                    [signature]: query.logs.length,
                                  }))
                                }
                              >
                                Show all
                              </Button>
                            </div>
                          )}

                          {query.fetched > MAX_LOGS ? (
                            <p className="hint event-logs-note">
                              The RPC returned {query.fetched.toLocaleString()}{" "}
                              logs. Only the first {MAX_LOGS} were decoded —
                              narrow the block range for complete results.
                            </p>
                          ) : query.logs.length < query.fetched ? (
                            <p className="hint event-logs-note">
                              {query.fetched - query.logs.length} of{" "}
                              {query.fetched} logs could not be decoded with the
                              active ABI.
                            </p>
                          ) : null}
                        </>
                      )}
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
