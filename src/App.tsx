import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { AbiViewer } from "@/components/abi-viewer/AbiViewer";
import { ContractImporter } from "@/components/contract-importer/ContractImporter";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FunctionCard } from "@/components/function-card/FunctionCard";
import { Header } from "@/components/header/Header";
import type { AbiInput, AbiFunction, Result } from "@/components/types";
import { cn } from "@/lib/utils";
import "./App.css";

const functionRows: [
  string,
  AbiFunction["stateMutability"],
  AbiInput[],
  string | undefined,
][] = [
  ["name", "view", [], "string"],
  ["symbol", "view", [], "string"],
  ["decimals", "view", [], "uint8"],
  ["totalSupply", "view", [], "uint256"],
  ["balanceOf", "view", [{ name: "account", type: "address" }], "uint256"],
  [
    "allowance",
    "view",
    [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    "uint256",
  ],
  ["owner", "view", [], "address"],
  ["paused", "view", [], "bool"],
  [
    "transfer",
    "nonpayable",
    [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    "bool",
  ],
  [
    "approve",
    "nonpayable",
    [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    "bool",
  ],
  [
    "transferFrom",
    "nonpayable",
    [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    "bool",
  ],
  [
    "mint",
    "nonpayable",
    [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    undefined,
  ],
  [
    "batchTransfer",
    "nonpayable",
    [
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    undefined,
  ],
  ["pause", "nonpayable", [], undefined],
  ["unpause", "nonpayable", [], undefined],
  ["deposit", "payable", [], undefined],
];
const demoAbi: AbiFunction[] = functionRows.map(
  ([name, stateMutability, inputs, output]) => ({
    name,
    type: "function",
    stateMutability,
    inputs,
    outputs: output ? [{ type: output }] : [],
  }),
);
const contractAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const knownResults: Record<string, Result> = {
  name: { value: "Demo Token" },
  symbol: { value: "DEMO" },
  decimals: { value: "18" },
  totalSupply: { value: "1000000", formatted: "1,000,000 DEMO" },
  balanceOf: { value: "48,210", formatted: "48,210 DEMO" },
  owner: { value: contractAddress },
  paused: { value: false },
  allowance: { value: "8,500", formatted: "8,500 DEMO" },
};
const emptyValues: Record<string, string> = {};

function App() {
  const [abi, setAbi] = useState<AbiFunction[] | null>(null);
  const [importMode, setImportMode] = useState<"address" | "paste" | "upload">(
    "address",
  );
  const [address, setAddress] = useState("");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState<"read" | "write">("read");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [results, setResults] = useState<Record<string, Result>>({});
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);
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
  const notify = useCallback((message: string) => {
    if (toastTimer.current !== undefined) {
      window.clearTimeout(toastTimer.current);
    }
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimer.current !== undefined) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);
  const loadAbi = useCallback(
    (nextAbi: AbiFunction[]) => {
      setAbi(nextAbi);
      setExpanded(null);
      setResults({});
      notify(`ABI loaded - ${nextAbi.length} functions found`);
    },
    [notify],
  );
  const parseAbi = useCallback(() => {
    try {
      const parsed = JSON.parse(paste) as AbiFunction[];
      const functions = parsed.filter((item) => item.type === "function");
      if (!functions.length) throw new Error();
      loadAbi(functions);
      setError("");
    } catch {
      setError("Paste a valid ABI JSON array with function entries.");
    }
  }, [loadAbi, paste]);
  const runFunction = useCallback(
    (fn: AbiFunction, isWrite: boolean) => {
      if (isWrite) {
        notify(`${fn.name}() transaction submitted`);
        return;
      }
      setResults((current) => ({
        ...current,
        [fn.name]: { value: "", loading: true },
      }));
      window.setTimeout(() => {
        setResults((current) => ({
          ...current,
          [fn.name]: knownResults[fn.name] ?? { value: "0x8b5e...c912" },
        }));
      }, 450);
    },
    [notify],
  );
  const copyAddress = useCallback(() => {
    void navigator.clipboard?.writeText(contractAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, []);
  const loadDemo = useCallback(() => loadAbi(demoAbi), [loadAbi]);
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
            address={address}
            paste={paste}
            error={error}
            copied={copied}
            onModeChange={setImportMode}
            onAddressChange={setAddress}
            onPasteChange={setPaste}
            onFetch={() => {
              loadAbi(demoAbi);
              setAddress(address || contractAddress);
              setError("");
            }}
            onParse={parseAbi}
            onUpload={loadDemo}
            onCopyAddress={copyAddress}
          />
          {abi && <AbiViewer abi={abi} />}
        </aside>
        <section className="content-area">
          {!abi ? (
            <EmptyState onLoad={loadDemo} />
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
                {(tab === "read" ? readFns : writeFns).map((fn) => (
                  <FunctionCard
                    key={fn.name}
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
      {toast && (
        <div className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
