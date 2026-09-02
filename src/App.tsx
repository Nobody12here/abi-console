import { useCallback, useMemo, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { AbiViewer } from "@/components/abi-viewer/AbiViewer";
import { ContractImporter } from "@/components/contract-importer/ContractImporter";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FunctionCard } from "@/components/function-card/FunctionCard";
import { Header } from "@/components/header/Header";
import type { AbiFunction, Result } from "@/components/types";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  readContract,
  writeContract,
  simulateContract,
  waitForTransactionReceipt,
} from "@wagmi/core";
import { config } from "./wagmiConfig";
import "./App.css";
import type { Address } from "viem";

const emptyValues: Record<string, string> = {};

function App() {
  const [abi, setAbi] = useState<AbiFunction[] | null>(null);
  const [importMode, setImportMode] = useState<"address" | "paste" | "upload">(
    "address",
  );
  const [contractAddress, setContractAddress] = useState("");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState<"read" | "write">("read");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [copied, setCopied] = useState(false);
  const readFns = useMemo(
    () =>
      (abi ?? []).filter(
        (fn) => fn.stateMutability === "view" || fn.stateMutability === "pure",
      ),
    [abi],
  );
  const writeFns = useMemo(
    () =>
      (abi ?? []).filter(
        (fn) =>
          fn.stateMutability === "nonpayable" ||
          fn.stateMutability === "payable",
      ),
    [abi],
  );

  const loadAbi = useCallback((nextAbi: AbiFunction[]) => {
    setAbi(nextAbi);
    setExpanded(null);
    setResults({});
    toast(`ABI loaded - ${nextAbi.length} functions found`, {
      duration: 2000,
    });
  }, []);
  const parseAbi = useCallback(() => {
    try {
      const parsed = JSON.parse(paste);
      let functionArray: AbiFunction[];
      if (Array.isArray(parsed)) {
        functionArray = parsed;
      } else if (parsed.abi && Array.isArray(parsed.abi)) {
        functionArray = parsed.abi;
      } else {
        throw new Error("Invalid ABI");
      }
      const functions = functionArray.filter(
        (item) => item.type === "function",
      );
      if (!functions.length) throw new Error();
      loadAbi(functions);
      setError("");
    } catch {
      setError("Paste a valid ABI JSON array with function entries.");
    }
  }, [loadAbi, paste]);

  const runFunction = useCallback(
    async (fn: AbiFunction, isWrite: boolean) => {
      if (abi) {
        try {
          setIsLoading(true);

          if (isWrite) {
            const { request } = await simulateContract(config, {
              abi,
              address: contractAddress as Address,
              functionName: fn.name,
              args: Object.values(values[fn.name] ?? ({} as any[])),
            });
            const txHash = await writeContract(config, request);
            const transactionReceipt = await waitForTransactionReceipt(config, {
              hash: txHash,
            });
            setResults((prev) => ({
              ...prev,
              [fn.name]: {
                value: String(
                  `Transaction submitted. Txhash : ${transactionReceipt.transactionHash}`,
                ),
              },
            }));
          } else {
            const result = await readContract(config, {
              abi,
              address: contractAddress as Address,
              functionName: fn.name,
              args: Object.values(values[fn.name] ?? {}) as any[],
            });
            setResults((prev) => ({
              ...prev,
              [fn.name]: {
                value: String(result),
              },
            }));
            console.log(result);
          }
        } catch (error) {
          setError(
            `Failed to call ${fn.name} : ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        } finally {
          setIsLoading(false);
        }
      }
    },
    [abi, contractAddress, values],
  );
  const copyAddress = useCallback(() => {
    void navigator.clipboard?.writeText(contractAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, []);
  const toggleExpanded = useCallback((functionName: string) => {
    setExpanded((current) => (current === functionName ? null : functionName));
  }, []);
  const changeValue = useCallback(
    (functionName: string, key: string, value: string) => {
      setValues((current) => ({
        ...current,
        [functionName]: { ...(current[functionName] ?? {}), [key]: value },
      }));
    },
    [],
  );

  return (
    <div className={cn("app-shell", !dark && "light-mode")}>
      <Header
        dark={dark}
        onToggleTheme={() => setDark((current) => !current)}
      />

      <main className="workspace">
        <aside className="sidebar">
          <ContractImporter
            abi={abi}
            importMode={importMode}
            address={contractAddress}
            isLoading={isLoading}
            paste={paste}
            error={error}
            copied={copied}
            onLoadingChange={setIsLoading}
            onModeChange={setImportMode}
            onAddressChange={setContractAddress}
            onPasteChange={setPaste}
            onFetch={(abi: AbiFunction[]) => {
              loadAbi(abi);
              setError("");
            }}
            onError={(error: string) => {
              loadAbi([]);
              setError(error);
            }}
            onParse={parseAbi}
            onUpload={() => console.log("upload needs to be worked on ")}
            onCopyAddress={copyAddress}
          />
          {abi && <AbiViewer abi={abi} />}
        </aside>
        <section className="content-area">
          {!abi ? (
            <EmptyState
              onLoad={() => {
                console.log("Empty state");
              }}
            />
          ) : (
            <>
              <div className="content-heading">
                <div>
                  <p className="eyebrow">INTERACTION SURFACE</p>
                  <h2>Contract methods</h2>
                </div>
                <div className="method-tabs">
                  <button
                    className={cn(tab === "read" && "active-read")}
                    onClick={() => setTab("read")}
                  >
                    Read <span>{readFns.length}</span>
                  </button>
                  <button
                    className={cn(tab === "write" && "active-write")}
                    onClick={() => setTab("write")}
                  >
                    Write <span>{writeFns.length}</span>
                  </button>
                </div>
              </div>
              <div className="method-list">
                {(tab === "read" ? readFns : writeFns).map((fn, idx) => (
                  <FunctionCard
                    key={`${fn.name} ${idx}`}
                    fn={fn}
                    expanded={expanded === fn.name}
                    values={values[fn.name] ?? emptyValues}
                    result={results[fn.name]}
                    isWrite={tab === "write"}
                    onToggle={toggleExpanded}
                    onChange={changeValue}
                    onRun={runFunction}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
      {isLoading && (
        <div className="loading-overlay">
          <Spinner />
        </div>
      )}
      <Toaster position="bottom-center" />
    </div>
  );
}

export default App;
