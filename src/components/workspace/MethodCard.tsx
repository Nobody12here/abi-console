import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Check,
  ChevronRight,
  Info,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import {
  encodeFunctionData,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import type {
  AbiRevision,
  ContractBinding,
  TxRecord,
} from "@/features/abi/types";
import {
  type AbiFunctionItem,
  canonicalParameterType,
  formatInputLabel,
  functionSignature,
  functionSelector,
} from "@/features/abi/utils";
import {
  buildFields,
  collectArgs,
  fieldsFromArgs,
  fieldsToArgsPreview,
  type ArgErrors,
  type FieldState,
} from "@/features/execution/args";
import { decodeContractError, errorMessage, isUserRejection } from "@/features/execution/errors";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { createReadClient } from "@/lib/rpc";
import {
  formatNativeValue,
  parseNativeValue,
  previewValue,
  toJson,
  copyText,
} from "@/lib/format";
import { chainName, getChain } from "@/lib/chains";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ArgsForm } from "./ArgsForm";
import { ResultView } from "./ResultView";
import { TransactionProgress } from "./TransactionProgress";

type SimState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; gas?: bigint; result?: unknown }
  | { status: "error"; message: string; decodedName?: string };

export type MethodPreview =
  | { status: "loading" }
  | { status: "ok"; value: unknown }
  | { status: "error" };

function encodeCall(fn: AbiFunctionItem, args: unknown[]): Hex {
  return encodeFunctionData({
    abi: [fn] as Abi,
    functionName: fn.name,
    args,
  } as never);
}

function safeJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, entry) =>
      typeof entry === "bigint" ? entry.toString() : entry,
    ),
  ) as T;
}

export function MethodCard({
  contract,
  revision,
  fn,
  mode,
  open,
  onToggle,
  preview,
}: {
  contract: ContractBinding;
  revision: AbiRevision;
  fn: AbiFunctionItem;
  mode: "read" | "write";
  open: boolean;
  onToggle: () => void;
  /** Auto-read value for view functions that take no arguments. */
  preview?: MethodPreview;
}) {
  const { settings, txs, addTx, updateTx } = useWorkspace();
  const { address: account, chainId: walletChainId, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const signature = functionSignature(fn);
  const selector = functionSelector(fn);
  const payable = fn.stateMutability === "payable";
  const argsKey = `abiconsole:args:${contract.id}:${signature}`;
  const threshold = (() => {
    try {
      return BigInt(settings.confirmValueThresholdWei || "0");
    } catch {
      return 0n;
    }
  })();

  const [fields, setFields] = useState<FieldState[]>(() => buildFields(fn.inputs));
  const [errors, setErrors] = useState<ArgErrors>({});
  const [valueInput, setValueInput] = useState("");
  const [valueUnit, setValueUnit] = useState<"native" | "wei">("native");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [blockInput, setBlockInput] = useState("");
  const [blockError, setBlockError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [readRequest, setReadRequest] = useState<{
    args: unknown[];
    block?: bigint;
  } | null>(null);
  const [sim, setSim] = useState<SimState>({ status: "idle" });
  const [sending, setSending] = useState(false);
  const [activeTxId, setActiveTxId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const loadedArgs = useRef(false);

  const chainMatch = isConnected && walletChainId === contract.chainId;
  const chain = getChain(contract.chainId);
  const nativeSymbol = chain?.nativeCurrency.symbol ?? "ETH";

  const collected = useMemo(
    () => collectArgs(fn.inputs, fields),
    [fn.inputs, fields],
  );
  const argsValid =
    Object.keys(collected.errors).length === 0 &&
    collected.args.every((arg) => arg !== undefined);

  const encoded = useMemo(() => {
    if (!open || !argsValid) return { data: undefined, error: undefined };
    try {
      return { data: encodeCall(fn, collected.args), error: undefined };
    } catch (error) {
      return { data: undefined, error: errorMessage(error) };
    }
  }, [open, argsValid, fn, collected.args]);

  const parsedValue = useMemo(() => {
    if (!payable) return { wei: 0n as bigint, error: undefined };
    try {
      return { wei: parseNativeValue(valueInput, valueUnit), error: undefined };
    } catch (error) {
      return { wei: 0n as bigint, error: errorMessage(error) };
    }
  }, [payable, valueInput, valueUnit]);

  // Read the balance through the same RPC as everything else, so a custom
  // RPC (for example a local node on another port) is respected.
  const balance = useQuery({
    queryKey: [
      "balance",
      contract.chainId,
      account,
      settings.rpcOverrides[contract.chainId] ?? "",
    ],
    enabled: Boolean(account) && payable && open,
    staleTime: 15_000,
    queryFn: () =>
      createReadClient(contract.chainId, settings.rpcOverrides).getBalance({
        address: account as Address,
      }),
  });

  const insufficientBalance =
    payable &&
    !parsedValue.error &&
    balance.data !== undefined &&
    parsedValue.wei > balance.data;

  const readEnabled = Boolean(readRequest) && mode === "read";
  const readQuery = useQuery({
    queryKey: [
      "read",
      contract.chainId,
      contract.address,
      signature,
      readRequest ? toJson(readRequest.args, 0) : "",
      readRequest?.block?.toString() ?? "latest",
      settings.rpcOverrides[contract.chainId] ?? "",
      nonce,
    ],
    enabled: readEnabled,
    retry: false,
    staleTime: 10_000,
    queryFn: async () => {
      if (!readRequest) throw new Error("No arguments were provided.");
      const client = createReadClient(
        contract.chainId,
        settings.rpcOverrides,
      );
      return (await client.readContract({
        address: contract.address as Address,
        abi: [fn] as Abi,
        functionName: fn.name,
        args: readRequest.args,
        blockNumber: readRequest.block,
      } as never)) as unknown;
    },
  });

  const readError = readQuery.error
    ? decodeContractError(readQuery.error, revision.abi)
    : undefined;

  const activeTx: TxRecord | undefined = activeTxId
    ? txs.find((tx) => tx.id === activeTxId)
    : undefined;
  const txInFlight =
    activeTx !== undefined &&
    (activeTx.status === "awaiting-signature" || activeTx.status === "pending");

  const argsDirty =
    readRequest !== null &&
    toJson(readRequest.args, 0) !== toJson(collected.args, 0);

  const rememberArgs = (args: unknown[]) => {
    if (!settings.rememberArgs || args.length === 0) return;
    try {
      localStorage.setItem(argsKey, fieldsToArgsPreview(args));
    } catch {
      // Remembering arguments is a convenience; storage may be unavailable.
    }
  };

  useEffect(() => {
    if (!open || loadedArgs.current || !settings.rememberArgs) return;
    loadedArgs.current = true;
    try {
      const raw = localStorage.getItem(argsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      setFields(fieldsFromArgs(fn.inputs, parsed));
    } catch {
      // Ignore stale or malformed remembered values.
    }
  }, [open, settings.rememberArgs, argsKey, fn.inputs]);

  useEffect(() => {
    if (readQuery.dataUpdatedAt > 0 && readRequest) {
      rememberArgs(readRequest.args);
    }
    // The query timestamp changes only when a read succeeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readQuery.dataUpdatedAt]);

  const updateField = (index: number, next: FieldState) => {
    setFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? next : field,
      ),
    );
    setSim({ status: "idle" });
  };

  const resetValues = () => {
    setFields(buildFields(fn.inputs));
    setErrors({});
    setValueInput("");
    setJsonText("");
    setJsonError(null);
    setSim({ status: "idle" });
    setReadRequest(null);
    setActiveTxId(null);
    try {
      localStorage.removeItem(argsKey);
    } catch {
      // Ignore storage errors.
    }
  };

  const queryRead = () => {
    const result = collectArgs(fn.inputs, fields);
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0) {
      toast.error("Fix the highlighted inputs first.");
      return;
    }
    let block: bigint | undefined;
    if (blockInput.trim()) {
      try {
        block = BigInt(blockInput.trim());
        if (block < 0n) throw new Error("negative");
      } catch {
        setBlockError("Enter a block number, or leave it empty for the latest block.");
        return;
      }
    }
    setBlockError(null);
    setReadRequest({ args: result.args, block });
    setNonce((value) => value + 1);
  };

  const simulateWrite = async () => {
    const result = collectArgs(fn.inputs, fields);
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0) {
      toast.error("Fix the highlighted inputs first.");
      return;
    }
    if (!isConnected || !account) {
      toast.error("Connect a wallet first.");
      return;
    }
    if (!chainMatch) {
      toast.error(`Switch your wallet to ${chainName(contract.chainId)} first.`);
      return;
    }
    if (parsedValue.error) {
      toast.error(parsedValue.error);
      return;
    }
    if (insufficientBalance) {
      toast.error("That value is higher than your wallet balance.");
      return;
    }

    setSim({ status: "running" });
    // Keep a pending transaction's progress visible until it settles.
    if (!txInFlight) setActiveTxId(null);
    try {
      const client = createReadClient(contract.chainId, settings.rpcOverrides);
      const request = {
        address: contract.address as Address,
        abi: [fn] as Abi,
        functionName: fn.name,
        args: result.args,
        account: account as Address,
        value: parsedValue.wei,
      } as never;
      const simulation = (await client.simulateContract(request)) as {
        result?: unknown;
      };

      let gas: bigint | undefined;
      try {
        gas = await client.estimateContractGas(request);
      } catch {
        gas = undefined;
      }

      setSim({ status: "success", gas, result: simulation.result });
      rememberArgs(result.args);
    } catch (error) {
      const decoded = decodeContractError(error, revision.abi);
      setSim({
        status: "error",
        message: decoded.message,
        decodedName: decoded.decodedName,
      });
    }
  };

  const sendWrite = async () => {
    if (!walletClient || !account) {
      toast.error("Connect a wallet first.");
      return;
    }
    if (!chainMatch) {
      toast.error(`Switch your wallet to ${chainName(contract.chainId)} first.`);
      return;
    }
    if (sim.status !== "success") {
      toast.error("Simulate the call first.");
      return;
    }

    setSending(true);
    const tx = addTx({
      contractId: contract.id,
      chainId: contract.chainId,
      address: contract.address,
      signature,
      selector,
      args: safeJson(collected.args),
      value: parsedValue.wei.toString(),
      status: "awaiting-signature",
    });
    setActiveTxId(tx.id);

    let hash: Hex;
    try {
      hash = (await walletClient.writeContract({
        address: contract.address as Address,
        abi: [fn] as Abi,
        functionName: fn.name,
        args: collected.args,
        account: account as Address,
        value: parsedValue.wei,
      } as never)) as Hex;
    } catch (error) {
      const decoded = decodeContractError(error, revision.abi);
      const rejected = isUserRejection(error);
      updateTx(tx.id, {
        status: rejected ? "rejected" : "failed",
        error: {
          message: rejected
            ? "You rejected the request in your wallet."
            : decoded.message,
          decodedName: decoded.decodedName,
          decodedArgs: decoded.decodedArgs,
        },
      });
      toast.error(rejected ? "Transaction rejected." : "Transaction failed.");
      setSending(false);
      return;
    }

    updateTx(tx.id, { status: "pending", hash });
    setSending(false);
    // A sent transaction consumes the simulation; the next send needs a new one.
    setSim({ status: "idle" });

    void (async () => {
      try {
        const client = createReadClient(
          contract.chainId,
          settings.rpcOverrides,
        );
        const receipt = await client.waitForTransactionReceipt({
          hash,
          timeout: 120_000,
        });
        updateTx(tx.id, {
          status: receipt.status === "success" ? "confirmed" : "failed",
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
          ...(receipt.status === "success"
            ? {}
            : {
                error: {
                  message:
                    "The transaction was included but reverted on-chain.",
                },
              }),
        });
        if (receipt.status === "success") {
          toast.success(`${fn.name} confirmed.`);
        } else {
          toast.error(`${fn.name} reverted on-chain.`);
        }
      } catch {
        toast(
          "No receipt yet. Check its status later in the Transactions tab.",
          { icon: "⏳" },
        );
      }
    })();
  };

  const requestSend = () => {
    if (payable && parsedValue.wei > threshold) {
      setConfirmOpen(true);
      return;
    }
    void sendWrite();
  };

  const copyArgs = async () => {
    if (!argsValid) {
      toast.error("Fill in the inputs first.");
      return;
    }
    try {
      await copyText(fieldsToArgsPreview(collected.args));
      toast.success("Arguments copied as JSON.");
    } catch {
      toast.error("Could not copy the arguments.");
    }
  };

  const applyJson = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setJsonError("That is not valid JSON.");
      return;
    }
    try {
      setFields(fieldsFromArgs(fn.inputs, parsed));
      setErrors({});
      setJsonError(null);
      setSim({ status: "idle" });
      toast.success("Arguments filled in.");
    } catch (error) {
      setJsonError(errorMessage(error));
    }
  };

  const disabled = sim.status === "running" || sending;
  const bodyId = `method-${mode}-${selector}`;

  const writeBlocker = !isConnected
    ? "Connect a wallet to simulate and send."
    : !chainMatch
      ? `Your wallet is on ${chainName(walletChainId)}. Switch to ${chainName(contract.chainId)}.`
      : undefined;

  return (
    <article className={cn("method", open && "is-open")}>
      <button
        type="button"
        className="method-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <ChevronRight
          size={14}
          className={cn("chevron", open && "rotate")}
          aria-hidden="true"
        />
        <span className="method-ident mono">
          <span className="method-name">{fn.name}</span>
          <span className="method-params">
            (
            {fn.inputs
              .map((input) => {
                const type = canonicalParameterType(input);
                return input.name ? `${type} ${input.name}` : type;
              })
              .join(", ")}
            )
          </span>
        </span>
        {payable && <span className="tag tag-amber">payable</span>}
        {preview && (
          <span className="method-preview mono">
            {preview.status === "loading" ? (
              <span className="muted">…</span>
            ) : preview.status === "error" ? (
              <span className="muted">error</span>
            ) : (
              previewValue(preview.value)
            )}
          </span>
        )}
        <span className="method-selector mono" title="Function selector">
          {selector}
        </span>
      </button>

      {open && (
        <div className="method-body" id={bodyId}>
          <ArgsForm
            inputs={fn.inputs}
            fields={fields}
            onChange={updateField}
            errors={errors}
            disabled={disabled}
          />

          {payable && (
            <div className="arg-field">
              <label className="arg-label" htmlFor={`${bodyId}-value`}>
                Value to send
                <em className="mono">{valueUnit === "native" ? nativeSymbol : "wei"}</em>
              </label>
              <div className="inline-field">
                <input
                  id={`${bodyId}-value`}
                  className={cn("field mono", parsedValue.error && "invalid")}
                  value={valueInput}
                  onChange={(event) => {
                    setValueInput(event.target.value);
                    setSim({ status: "idle" });
                  }}
                  placeholder="0"
                  inputMode="decimal"
                  spellCheck={false}
                  disabled={disabled}
                />
                <div className="segmented small" role="group" aria-label="Value unit">
                  {(["native", "wei"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      className={valueUnit === unit ? "selected" : ""}
                      aria-pressed={valueUnit === unit}
                      onClick={() => {
                        setValueUnit(unit);
                        setSim({ status: "idle" });
                      }}
                    >
                      {unit === "native" ? nativeSymbol : "wei"}
                    </button>
                  ))}
                </div>
              </div>
              {parsedValue.error ? (
                <p className="field-error">{parsedValue.error}</p>
              ) : insufficientBalance ? (
                <p className="field-error">More than your wallet balance.</p>
              ) : (
                account && (
                  <p className="hint">
                    Balance:{" "}
                    {balance.data !== undefined
                      ? formatNativeValue(balance.data, nativeSymbol)
                      : "…"}
                  </p>
                )
              )}
            </div>
          )}

          {encoded.error && argsValid && (
            <p className="status-line danger" role="alert">
              <TriangleAlert size={14} /> Could not encode the call:{" "}
              {encoded.error}
            </p>
          )}

          {mode === "read" ? (
            <div className="method-actions">
              <Button
                variant="primary"
                loading={readQuery.isFetching}
                disabled={!argsValid || readQuery.isFetching}
                onClick={queryRead}
              >
                {readRequest ? "Query again" : "Query"}
              </Button>
            </div>
          ) : (
            <>
              {writeBlocker && (
                <p className="status-line muted">
                  <Info size={14} /> {writeBlocker}
                </p>
              )}
              <div className="method-actions">
                <Button
                  variant={sim.status === "success" ? "secondary" : "primary"}
                  loading={sim.status === "running"}
                  disabled={
                    disabled ||
                    !argsValid ||
                    Boolean(writeBlocker) ||
                    Boolean(parsedValue.error) ||
                    insufficientBalance
                  }
                  onClick={() => void simulateWrite()}
                >
                  {sim.status === "success" ? "Simulate again" : "Simulate"}
                </Button>
                <Button
                  variant="primary"
                  loading={sending}
                  disabled={
                    sim.status !== "success" ||
                    sending ||
                    Boolean(writeBlocker) ||
                    txInFlight
                  }
                  onClick={requestSend}
                  title={
                    sim.status !== "success"
                      ? "Run a successful simulation first"
                      : undefined
                  }
                >
                  {sending ? "Confirm in wallet…" : "Send transaction"}
                </Button>
                {sim.status === "running" && (
                  <span className="hint">
                    <Loader2 size={13} className="spin" /> Simulating…
                  </span>
                )}
              </div>
            </>
          )}

          <div aria-live="polite">
            {mode === "read" && (
              <>
                {argsDirty && readRequest && (
                  <p className="hint">
                    Inputs changed since this result. Query again to update it.
                  </p>
                )}
                {readQuery.isSuccess && readRequest && (
                  <ResultView
                    outputs={fn.outputs ?? []}
                    value={readQuery.data}
                    label={
                      readRequest.block !== undefined
                        ? `Result at block ${readRequest.block.toString()}`
                        : "Result"
                    }
                  />
                )}
                {readError && (
                  <p className="status-line danger" role="alert">
                    <TriangleAlert size={14} /> {readError.message}
                  </p>
                )}
              </>
            )}

            {mode === "write" && sim.status === "error" && (
              <div className="callout danger" role="alert">
                <strong>
                  Simulation reverted
                  {sim.decodedName ? `: ${sim.decodedName}` : ""}
                </strong>
                <p className="mono">{sim.message}</p>
              </div>
            )}

            {mode === "write" && sim.status === "success" && (
              <div className="callout success">
                <strong>
                  <Check size={14} /> Simulation passed
                  {sim.gas ? ` · ~${sim.gas.toLocaleString()} gas` : ""}
                </strong>
                <p>
                  The call would not revert right now. That doesn’t guarantee it
                  will succeed on-chain.
                </p>
                {sim.result !== undefined && (
                  <pre className="mono">Returns: {toJson(sim.result)}</pre>
                )}
              </div>
            )}

            {mode === "write" && activeTx && (
              <TransactionProgress tx={activeTx} chainId={contract.chainId} />
            )}
          </div>

          <div className="calldata">
            <span className="calldata-label">Calldata</span>
            {encoded.data ? (
              <>
                <code className="mono">{encoded.data}</code>
                <CopyButton value={encoded.data} label="Copy calldata" compact />
              </>
            ) : (
              <span className="muted">Fill in every input to see calldata.</span>
            )}
          </div>

          <details className="advanced">
            <summary>More options</summary>
            <div className="advanced-body">
              <div className="advanced-row">
                <span className="advanced-label">Signature</span>
                <code className="mono">{signature}</code>
                <CopyButton value={signature} label="Copy signature" compact />
              </div>

              {mode === "read" && (
                <label className="advanced-row">
                  <span className="advanced-label">Block</span>
                  <input
                    className={cn("field mono compact", blockError && "invalid")}
                    value={blockInput}
                    onChange={(event) => setBlockInput(event.target.value)}
                    placeholder="latest"
                    inputMode="numeric"
                    spellCheck={false}
                  />
                </label>
              )}
              {blockError && <p className="field-error">{blockError}</p>}

              {fn.inputs.length > 0 && (
                <div className="json-args">
                  <label className="advanced-label" htmlFor={`${bodyId}-json`}>
                    Fill inputs from a JSON array
                  </label>
                  <textarea
                    id={`${bodyId}-json`}
                    className={cn("field mono textarea compact", jsonError && "invalid")}
                    value={jsonText}
                    onChange={(event) => setJsonText(event.target.value)}
                    placeholder={`[${fn.inputs
                      .map((input, index) => formatInputLabel(input, index))
                      .join(", ")}]`}
                    spellCheck={false}
                  />
                  {jsonError && <p className="field-error">{jsonError}</p>}
                  <div className="button-row">
                    <Button size="sm" onClick={applyJson} disabled={!jsonText.trim()}>
                      Apply
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void copyArgs()}>
                      Copy current inputs as JSON
                    </Button>
                  </div>
                </div>
              )}

              <div className="button-row">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw size={13} />}
                  onClick={resetValues}
                >
                  Clear inputs and result
                </Button>
              </div>
            </div>
          </details>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Send ${formatNativeValue(parsedValue.wei, nativeSymbol)}?`}
        description={`This calls ${fn.name} on ${contract.address} (${chainName(contract.chainId)}) and sends ${formatNativeValue(parsedValue.wei, nativeSymbol)} with it. You can change when this check appears in Settings.`}
        confirmLabel="Continue to wallet"
        tone="primary"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void sendWrite();
        }}
      />
    </article>
  );
}
