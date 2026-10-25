import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, useWalletClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Check,
  ChevronRight,
  ClipboardPaste,
  Code2,
  Copy,
  FlaskConical,
  Info,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  TriangleAlert,
  Wallet,
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
  formatInputLabel,
  canonicalParameterType,
  functionSignature,
  functionSelector,
  outputSummary,
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
  toJson,
  copyText,
} from "@/lib/format";
import { chainName, getChain } from "@/lib/chains";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { ArgsForm } from "./ArgsForm";
import { ResultView } from "./ResultView";
import { TransactionProgress } from "./TransactionProgress";

type SimState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; gas?: bigint; result?: unknown }
  | { status: "error"; message: string; decodedName?: string };

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
}: {
  contract: ContractBinding;
  revision: AbiRevision;
  fn: AbiFunctionItem;
  mode: "read" | "write";
  open: boolean;
  onToggle: () => void;
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
  const [jsonOpen, setJsonOpen] = useState(false);
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

  const balance = useBalance({
    address: account,
    chainId: contract.chainId,
    query: { enabled: Boolean(account) && payable },
  });

  const insufficientBalance =
    payable &&
    !parsedValue.error &&
    balance.data !== undefined &&
    parsedValue.wei > balance.data.value;

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
    (activeTx.status === "awaiting-signature" ||
      activeTx.status === "pending" ||
      activeTx.status === "confirmed");

  const argsDirty =
    readRequest !== null &&
    toJson(readRequest.args, 0) !== toJson(collected.args, 0);

  const rememberArgs = (args: unknown[]) => {
    if (!settings.rememberArgs) return;
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
      toast.error("Fix the highlighted inputs before querying.");
      return;
    }
    let block: bigint | undefined;
    if (blockInput.trim()) {
      try {
        block = BigInt(blockInput.trim());
        if (block < 0n) throw new Error("negative");
      } catch {
        setBlockError("Enter a positive block number, or leave it empty for latest.");
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
      toast.error("Fix the highlighted inputs before simulating.");
      return;
    }
    if (!isConnected || !account) {
      toast.error("Connect a wallet to simulate a write.");
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
    try {
      const client = createReadClient(contract.chainId, settings.rpcOverrides);
      const simulation = (await client.simulateContract({
        address: contract.address as Address,
        abi: [fn] as Abi,
        functionName: fn.name,
        args: result.args,
        account: account as Address,
        value: parsedValue.wei,
      } as never)) as { result?: unknown };

      let gas: bigint | undefined;
      try {
        gas = await client.estimateContractGas({
          address: contract.address as Address,
          abi: [fn] as Abi,
          functionName: fn.name,
          args: result.args,
          account: account as Address,
          value: parsedValue.wei,
        } as never);
      } catch {
        gas = undefined;
      }

      setSim({
        status: "success",
        gas,
        result: simulation.result,
      });
      rememberArgs(result.args);
      toast.success("Simulation succeeded.");
    } catch (error) {
      const decoded = decodeContractError(error, revision.abi);
      setSim({
        status: "error",
        message: decoded.message,
        decodedName: decoded.decodedName,
      });
      toast.error("Simulation reverted.");
    }
  };

  const sendWrite = async () => {
    if (!walletClient || !account) {
      toast.error("Connect a wallet to send this transaction.");
      return;
    }
    if (!chainMatch) {
      toast.error(`Switch your wallet to ${chainName(contract.chainId)} first.`);
      return;
    }
    if (sim.status !== "success") {
      toast.error("Simulate the call successfully before sending.");
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
            ? "Signature request rejected in the wallet."
            : decoded.message,
          decodedName: decoded.decodedName,
          decodedArgs: decoded.decodedArgs,
        },
      });
      toast.error(rejected ? "Transaction rejected." : decoded.message);
      setSending(false);
      return;
    }

    updateTx(tx.id, { status: "pending", hash });
    setSending(false);
    toast.success("Transaction sent. Waiting for a receipt…");

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
          toast.success("Transaction confirmed.");
        } else {
          toast.error("Transaction reverted on-chain.");
        }
      } catch {
        toast(
          "The receipt is not available yet. Check the status from the history panel.",
          { icon: "⏳" },
        );
      }
    })();
  };

  const requestSend = () => {
    if (!isConnected || !account) {
      toast.error("Connect a wallet to send this transaction.");
      return;
    }
    if (!chainMatch) {
      toast.error(`Switch your wallet to ${chainName(contract.chainId)} first.`);
      return;
    }
    if (sim.status !== "success") {
      toast.error("Simulate the call successfully before sending.");
      return;
    }
    if (payable && parsedValue.wei > threshold) {
      setConfirmOpen(true);
      return;
    }
    void sendWrite();
  };

  const copyArgs = async () => {
    if (!argsValid) {
      toast.error("Fix the inputs before copying arguments.");
      return;
    }
    try {
      await copyText(fieldsToArgsPreview(collected.args));
      toast.success("Arguments copied as JSON.");
    } catch {
      toast.error("Could not copy the arguments.");
    }
  };

  const openJson = () => {
    setJsonOpen((value) => {
      const next = !value;
      if (next) {
        setJsonText(
          argsValid ? fieldsToArgsPreview(collected.args) : "",
        );
        setJsonError(null);
      }
      return next;
    });
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
      toast.success("Arguments loaded.");
    } catch (error) {
      setJsonError(errorMessage(error));
    }
  };

  const disabled = sim.status === "running" || sending;
  const inputCount = fn.inputs.length;

  return (
    <article className={cn("method-card", open && "is-open", mode)}>
      <button
        type="button"
        className="method-card-toggle"
        aria-expanded={open}
        aria-controls={`method-body-${signature}`}
        onClick={onToggle}
      >
        <ChevronRight
          size={15}
          className={cn("method-chevron", open && "rotate")}
          aria-hidden="true"
        />
        <span className="method-ident">
          <span className="method-name mono">{fn.name}</span>
          <span className="method-params mono">
            (
            {fn.inputs
              .map((input, index) => {
                const label = formatInputLabel(input, index);
                const type = canonicalParameterType(input);
                return input.name ? `${type} ${label}` : type;
              })
              .join(", ")}
            )
          </span>
        </span>
        <span className="method-meta">
          <Badge tone={mode === "read" ? "blue" : "amber"}>
            {fn.stateMutability === "pure"
              ? "PURE"
              : fn.stateMutability === "view"
                ? "VIEW"
                : payable
                  ? "PAYABLE"
                  : "WRITE"}
          </Badge>
          {inputCount > 0 && (
            <span className="method-arg-count">
              {inputCount} arg{inputCount === 1 ? "" : "s"}
            </span>
          )}
          <span className="method-selector mono">{selector}</span>
          <span className="method-output mono">
            → {outputSummary(fn)}
          </span>
        </span>
      </button>

      {open && (
        <div
          className="method-body"
          id={`method-body-${signature}`}
          aria-live="polite"
        >
          {mode === "write" && (
            <>
              {!isConnected && (
                <div className="notice info">
                  <Wallet size={16} />
                  <div>
                    <strong>Wallet not connected</strong>
                    <p>
                      Reads are open to everyone. Connect a wallet on{" "}
                      {chainName(contract.chainId)} to simulate and send this
                      write.
                    </p>
                  </div>
                </div>
              )}
              {isConnected && !chainMatch && (
                <div className="notice warning">
                  <ShieldAlert size={16} />
                  <div>
                    <strong>Wrong network</strong>
                    <p>
                      Your wallet is on {chainName(walletChainId)}. This contract
                      is on {chainName(contract.chainId)}. Switch networks before
                      simulating.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="method-signature-line">
            <code className="mono">{signature}</code>
            <CopyButton value={signature} label="Copy signature" compact />
            <span className="selector-chip mono">{selector}</span>
            <CopyButton value={selector} label="Copy selector" compact />
          </div>

          <ArgsForm
            inputs={fn.inputs}
            fields={fields}
            onChange={updateField}
            errors={errors}
            disabled={disabled}
          />

          <div className="method-tools">
            <button type="button" className="text-link" onClick={openJson}>
              <ClipboardPaste size={13} />
              {jsonOpen ? "Hide JSON arguments" : "Paste JSON arguments"}
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => void copyArgs()}
            >
              <Copy size={13} /> Copy arguments
            </button>
            <button
              type="button"
              className="text-link"
              onClick={resetValues}
            >
              <RotateCcw size={13} /> Reset values
            </button>
          </div>

          {jsonOpen && (
            <div className="json-args">
              <label className="field-label" htmlFor={`json-${signature}`}>
                Arguments as a JSON array
              </label>
              <textarea
                id={`json-${signature}`}
                className={cn("field mono textarea compact", jsonError && "invalid")}
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                placeholder="[1, &quot;0x…&quot;, true]"
                spellCheck={false}
              />
              {jsonError && <p className="field-error">{jsonError}</p>}
              <div className="json-args-actions">
                <Button size="sm" variant="secondary" onClick={applyJson}>
                  Apply JSON
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    try {
                      setJsonText(
                        toJson(JSON.parse(jsonText), 2),
                      );
                      setJsonError(null);
                    } catch {
                      setJsonError("That is not valid JSON.");
                    }
                  }}
                >
                  Format
                </Button>
              </div>
            </div>
          )}

          {payable && (
            <div className="value-field">
              <div className="value-field-labels">
                <label className="field-label" htmlFor={`value-${signature}`}>
                  Native value
                </label>
                <span className="hint">
                  Balance:{" "}
                  {balance.data
                    ? `${balance.data.formatted} ${balance.data.symbol}`
                    : account
                      ? "loading…"
                      : "not connected"}
                </span>
              </div>
              <div className="value-input-row">
                <input
                  id={`value-${signature}`}
                  className={cn("field mono", parsedValue.error && "invalid")}
                  value={valueInput}
                  onChange={(event) => {
                    setValueInput(event.target.value);
                    setSim({ status: "idle" });
                  }}
                  placeholder="0.0"
                  inputMode="decimal"
                  spellCheck={false}
                  disabled={disabled}
                />
                <div className="unit-toggle" role="group" aria-label="Value unit">
                  <button
                    type="button"
                    className={valueUnit === "native" ? "selected" : ""}
                    aria-pressed={valueUnit === "native"}
                    onClick={() => {
                      setValueUnit("native");
                      setSim({ status: "idle" });
                    }}
                  >
                    {nativeSymbol}
                  </button>
                  <button
                    type="button"
                    className={valueUnit === "wei" ? "selected" : ""}
                    aria-pressed={valueUnit === "wei"}
                    onClick={() => {
                      setValueUnit("wei");
                      setSim({ status: "idle" });
                    }}
                  >
                    wei
                  </button>
                </div>
              </div>
              {parsedValue.error ? (
                <p className="field-error">{parsedValue.error}</p>
              ) : (
                <p className="hint mono">
                  = {parsedValue.wei.toString()} wei
                </p>
              )}
              {insufficientBalance && (
                <p className="field-error">
                  Value exceeds the connected wallet balance.
                </p>
              )}
            </div>
          )}

          {encoded.error && argsValid && (
            <div className="issue-box" role="alert">
              <span className="issue-icon">
                <TriangleAlert size={16} />
              </span>
              <div>
                <strong>Could not encode the call</strong>
                <p>{encoded.error}</p>
              </div>
            </div>
          )}

          <div className="calldata-preview">
            <div className="calldata-heading">
              <span className="eyebrow">
                <Code2 size={12} /> CALLDATA
              </span>
              <span className="calldata-flags mono">
                {chainName(contract.chainId)} · {contract.address.slice(0, 6)}…
                {contract.address.slice(-4)}
                {payable && parsedValue.wei > 0n
                  ? ` · ${formatNativeValue(parsedValue.wei, nativeSymbol)}`
                  : ""}
              </span>
              {encoded.data && (
                <CopyButton
                  value={encoded.data}
                  label="Copy calldata"
                  compact
                />
              )}
            </div>
            {encoded.data ? (
              <code className="calldata-value mono">{encoded.data}</code>
            ) : (
              <p className="hint">
                Fill every input to generate calldata.
              </p>
            )}
          </div>

          {mode === "read" ? (
            <>
              <div className="method-actions">
                <Button
                  variant="primary"
                  icon={<Play size={15} />}
                  loading={readQuery.isFetching}
                  disabled={!argsValid || readQuery.isFetching}
                  onClick={queryRead}
                >
                  Query
                </Button>
                {readRequest && (
                  <Button
                    variant="ghost"
                    icon={<RefreshCw size={14} />}
                    loading={readQuery.isFetching}
                    onClick={() => setNonce((value) => value + 1)}
                  >
                    Refresh
                  </Button>
                )}
                <label className="block-field">
                  <span>Block</span>
                  <input
                    className={cn("field mono compact", blockError && "invalid")}
                    value={blockInput}
                    onChange={(event) => setBlockInput(event.target.value)}
                    placeholder="latest"
                    inputMode="numeric"
                    spellCheck={false}
                  />
                </label>
              </div>
              {blockError && <p className="field-error">{blockError}</p>}

              {argsDirty && readRequest && (
                <p className="hint stale-hint">
                  <Info size={13} /> Inputs changed since this result. Run the
                  query again to refresh.
                </p>
              )}

              {readQuery.isSuccess && readRequest && (
                <ResultView
                  outputs={fn.outputs ?? []}
                  value={readQuery.data}
                  label={`Result · block ${readRequest.block?.toString() ?? "latest"}`}
                />
              )}

              {readError && (
                <div className="tx-note danger" role="alert">
                  <TriangleAlert size={14} /> {readError.message}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="method-actions">
                <Button
                  variant="secondary"
                  icon={<FlaskConical size={15} />}
                  loading={sim.status === "running"}
                  disabled={
                    disabled ||
                    !argsValid ||
                    !isConnected ||
                    !chainMatch ||
                    Boolean(parsedValue.error) ||
                    insufficientBalance
                  }
                  onClick={() => void simulateWrite()}
                >
                  Simulate
                </Button>
                <Button
                  variant="primary"
                  icon={<Send size={15} />}
                  loading={sending}
                  disabled={
                    sim.status !== "success" ||
                    sending ||
                    !isConnected ||
                    !chainMatch ||
                    txInFlight
                  }
                  onClick={requestSend}
                  title={
                    sim.status !== "success"
                      ? "A successful simulation is required first"
                      : undefined
                  }
                >
                  {sending ? "Waiting for wallet…" : "Send transaction"}
                </Button>
                {sim.status === "success" && (
                  <Button
                    variant="ghost"
                    icon={<RotateCcw size={13} />}
                    size="sm"
                    onClick={() => {
                      setSim({ status: "idle" });
                      setActiveTxId(null);
                    }}
                  >
                    Simulate again
                  </Button>
                )}
              </div>

              {!isConnected && (
                <p className="hint">
                  <KeyRound size={13} /> Connect a wallet on{" "}
                  {chainName(contract.chainId)} to simulate.
                </p>
              )}

              {sim.status === "running" && (
                <p className="hint">
                  <Loader2 size={13} className="spin" /> Running eth_call
                  simulation…
                </p>
              )}

              {sim.status === "error" && (
                <div className="sim-result error" role="alert">
                  <span className="sim-icon">
                    <TriangleAlert size={16} />
                  </span>
                  <div>
                    <strong>
                      Simulation reverted
                      {sim.decodedName ? ` · ${sim.decodedName}` : ""}
                    </strong>
                    <p className="mono">{sim.message}</p>
                  </div>
                </div>
              )}

              {sim.status === "success" && (
                <div className="sim-result success">
                  <span className="sim-icon">
                    <Check size={16} />
                  </span>
                  <div>
                    <strong>Simulation succeeded</strong>
                    <p>
                      The call did not revert
                      {sim.gas ? ` · estimated gas ${sim.gas.toLocaleString()}` : ""}
                      . This is not a safety guarantee.
                    </p>
                    {sim.result !== undefined && (
                      <pre className="sim-return mono">
                        {toJson(sim.result)}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {activeTx && (
                <TransactionProgress
                  tx={activeTx}
                  signing={sending}
                  chainId={contract.chainId}
                />
              )}
            </>
          )}

          <div className="method-footnote">
            <span>
              <ChainBadge chainId={contract.chainId} />
              <span className="mono">{selector}</span>
            </span>
            <span className="hint">
              {mode === "read"
                ? "Read calls never require a signature."
                : "Simulation uses your connected account. Writes are never auto-retried."}
            </span>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm native value"
        description={`You are about to send ${formatNativeValue(parsedValue.wei, nativeSymbol)} to ${contract.address} on ${chainName(contract.chainId)}. Calls above your configured threshold require an explicit confirmation.`}
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
