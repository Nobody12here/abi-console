import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  ArrowLeft,
  ChevronRight,
  CirclePlus,
  Clock3,
  Code2,
  FileCode2,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react";
import { AbiViewer } from "@/components/abi-viewer/AbiViewer";
import { ContractImporter } from "@/components/contract-importer/ContractImporter";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FunctionCard } from "@/components/function-card/FunctionCard";
import { Header } from "@/components/header/Header";
import type { AbiFunction, Result, SavedContract } from "@/components/types";
import { Spinner } from "@/components/ui/spinner";
import { cn, formatContractError, shortenAddress } from "@/lib/utils";
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
const storageKey = "abi-console-contracts";
const networks = [
  { id: "11155111", name: "Ethereum Sepolia" },
  { id: "1", name: "Ethereum Mainnet" },
  { id: "137", name: "Polygon" },
  { id: "10", name: "Optimism" },
  { id: "42161", name: "Arbitrum One" },
  { id: "8453", name: "Base" },
];

function App() {
  const [abi, setAbi] = useState<AbiFunction[] | null>(null);
  const [importMode, setImportMode] = useState<"address" | "paste" | "upload">(
    "address",
  );
  const [contractAddress, setContractAddress] = useState("");
  const [contractName, setContractName] = useState("");
  const [networkId, setNetworkId] = useState(networks[0].id);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [dark, setDark] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [contracts, setContracts] = useState<SavedContract[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(storageKey) ?? "[]",
      ) as SavedContract[];
    } catch {
      return [];
    }
  });
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null,
  );
  const [workspaceView, setWorkspaceView] = useState<
    "home" | "import" | "detail"
  >("home");
  const [searchTerm, setSearchTerm] = useState("");
  const [detailTab, setDetailTab] = useState<
    "overview" | "read" | "write" | "transactions" | "abi"
  >("overview");
  const [transactions, setTransactions] = useState<
    Array<{ hash: string; functionName: string; status: string; time: string }>
  >([]);
  const selectedContract =
    contracts.find((contract) => contract.id === selectedContractId) ?? null;
  const selectedNetwork =
    networks.find((network) => network.id === networkId) ?? networks[0];
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

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(contracts));
  }, [contracts]);

  const loadAbi = useCallback((nextAbi: AbiFunction[]) => {
    setAbi(nextAbi);
    setExpanded(null);
    setResults({});
    toast(`ABI loaded - ${nextAbi.length} functions found`, {
      duration: 2000,
    });
  }, []);
  const saveContract = useCallback(
    (nextAbi: AbiFunction[]) => {
      const nextContract: SavedContract = {
        id: `${networkId}:${contractAddress.toLowerCase()}`,
        name:
          contractName.trim() || `Contract ${shortenAddress(contractAddress)}`,
        address: contractAddress,
        networkId,
        networkName: selectedNetwork.name,
        abi: nextAbi,
        updatedAt: new Date().toISOString(),
      };
      setContracts((current) => [
        nextContract,
        ...current.filter((contract) => contract.id !== nextContract.id),
      ]);
      setSelectedContractId(nextContract.id);
      setWorkspaceView("detail");
      setDetailTab("overview");
    },
    [contractAddress, contractName, networkId, selectedNetwork.name],
  );
  const openContract = useCallback((contract: SavedContract) => {
    setSelectedContractId(contract.id);
    setContractAddress(contract.address);
    setContractName(contract.name);
    setNetworkId(contract.networkId);
    setAbi(contract.abi);
    setExpanded(null);
    setResults({});
    setError("");
    setWorkspaceView("detail");
    setDetailTab("overview");
  }, []);
  const removeContract = useCallback(
    (id: string) => {
      setContracts((current) =>
        current.filter((contract) => contract.id !== id),
      );
      if (selectedContractId === id) {
        setSelectedContractId(null);
        setWorkspaceView("home");
        setAbi(null);
      }
    },
    [selectedContractId],
  );
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
      saveContract(functions);
      setError("");
    } catch {
      setError("Paste a valid ABI JSON array with function entries.");
    }
  }, [loadAbi, paste, saveContract]);

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
            setTransactions((current) => [
              {
                hash: transactionReceipt.transactionHash,
                functionName: fn.name,
                status: "Confirmed",
                time: new Date().toISOString(),
              },
              ...current,
            ]);
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
          console.error(error);
          setError(formatContractError(error, fn.name, isWrite));
        } finally {
          setIsLoading(false);
        }
      }
    },
    [abi, contractAddress, values],
  );
  const copyAddress = useCallback(() => {
    void navigator.clipboard?.writeText(contractAddress);
    toast("Address Copied", {
      duration: 2000,
    });
  }, [contractAddress]);
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const functionArray = Array.isArray(parsed) ? parsed : parsed.abi;
      const functions = Array.isArray(functionArray)
        ? functionArray.filter((item) => item.type === "function")
        : [];

      if (!functions.length) {
        throw new Error("The selected file does not contain ABI functions.");
      }

      setPaste(JSON.stringify(parsed));
      loadAbi(functions);
      saveContract(functions);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Upload a valid ABI JSON file.",
      );
    }
  };

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

      <main
        className={cn(
          "workspace",
          workspaceView === "home" && "home-workspace",
          workspaceView === "import" && "import-workspace",
        )}
      >
        <aside className="sidebar workspace-sidebar">
          <div className="sidebar-title">
            <div>
              <p className="eyebrow">WORKSPACE</p>
              <h1>Contracts</h1>
            </div>
            <button
              className="icon-button"
              aria-label="Add contract"
              title="Add contract"
              onClick={() => setWorkspaceView("import")}
            >
              <CirclePlus size={18} />
            </button>
          </div>
          <label className="search-box">
            <Search size={15} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search contracts"
            />
          </label>
          <div className="contract-list">
            {contracts
              .filter((contract) =>
                `${contract.name} ${contract.address} ${contract.networkName}`
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase()),
              )
              .map((contract) => (
                <button
                  key={contract.id}
                  className={cn(
                    "contract-item",
                    selectedContractId === contract.id && "selected",
                  )}
                  onClick={() => openContract(contract)}
                >
                  <span className="contract-icon">
                    <FileCode2 size={16} />
                  </span>
                  <span className="contract-item-copy">
                    <strong>{contract.name}</strong>
                    <small>
                      {contract.networkName} <i />{" "}
                      {shortenAddress(contract.address)}
                    </small>
                  </span>
                  <ChevronRight size={15} className="contract-arrow" />
                  <span
                    className="contract-delete"
                    role="button"
                    aria-label={`Delete ${contract.name}`}
                    title="Delete contract"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeContract(contract.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </span>
                </button>
              ))}
            {!contracts.length && (
              <p className="sidebar-empty">No contracts saved yet.</p>
            )}
          </div>
          {workspaceView === "detail" && selectedContract && (
            <button
              className="back-button"
              onClick={() => setWorkspaceView("home")}
            >
              <ArrowLeft size={15} /> All contracts
            </button>
          )}
        </aside>
        {workspaceView === "import" && (
          <aside className="sidebar importer-column">
            <ContractImporter
              abi={abi}
              importMode={importMode}
              address={contractAddress}
              name={contractName}
              networkId={networkId}
              networks={networks}
              isLoading={isLoading}
              paste={paste}
              error={error}
              onLoadingChange={setIsLoading}
              onModeChange={setImportMode}
              onAddressChange={setContractAddress}
              onNameChange={setContractName}
              onNetworkChange={setNetworkId}
              onPasteChange={setPaste}
              onFetch={(abi: AbiFunction[]) => {
                loadAbi(abi);
                saveContract(abi);
                setError("");
              }}
              onError={(error: string) => {
                loadAbi([]);
                setError(error);
              }}
              onParse={parseAbi}
              onUpload={handleFileChange}
              onCopyAddress={copyAddress}
            />
            {abi && <AbiViewer abi={abi} />}
          </aside>
        )}
        <section className="content-area">
          {workspaceView === "home" ? (
            <div className="workspace-home">
              <div className="home-intro">
                <p className="eyebrow">CONTRACT WORKSPACE</p>
                <h2>Your contracts</h2>
                <p>
                  Keep your deployed interfaces close. Select a contract to
                  inspect methods, run calls, and review activity.
                </p>
              </div>
              <button
                className="add-contract-card"
                onClick={() => setWorkspaceView("import")}
              >
                <span>
                  <CirclePlus size={21} />
                </span>
                <strong>Add a contract</strong>
                <small>Import an ABI and address to create a workspace</small>
              </button>
              <div className="home-stats">
                <div>
                  <strong>{contracts.length}</strong>
                  <span>Saved contracts</span>
                </div>
                <div>
                  <strong>
                    {contracts.reduce(
                      (total, contract) => total + contract.abi.length,
                      0,
                    )}
                  </strong>
                  <span>Indexed methods</span>
                </div>
                <div>
                  <strong>
                    {
                      new Set(contracts.map((contract) => contract.networkId))
                        .size
                    }
                  </strong>
                  <span>Networks</span>
                </div>
              </div>
            </div>
          ) : workspaceView === "import" ? (
            <EmptyState />
          ) : !abi || !selectedContract ? (
            <EmptyState />
          ) : (
            <>
              <div className="contract-hero">
                <div>
                  <p className="eyebrow">
                    {selectedContract.networkName.toUpperCase()}
                  </p>
                  <h2>{selectedContract.name}</h2>
                  <button className="address-link mono" onClick={copyAddress}>
                    {shortenAddress(selectedContract.address)}{" "}
                    <Code2 size={13} /> Copy address
                  </button>
                </div>
                <button
                  className="icon-button"
                  aria-label="Contract actions"
                  title="Contract actions"
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              <nav className="detail-tabs">
                {(
                  ["overview", "read", "write", "transactions", "abi"] as const
                ).map((id) => (
                  <button
                    key={id}
                    className={cn(detailTab === id && "active")}
                    onClick={() => setDetailTab(id)}
                  >
                    {id === "read"
                      ? `Read methods ${readFns.length}`
                      : id === "write"
                        ? `Write methods ${writeFns.length}`
                        : id === "transactions"
                          ? "Transactions"
                          : id === "abi"
                            ? "ABI"
                            : "Overview"}
                  </button>
                ))}
              </nav>
              {detailTab === "overview" && (
                <div className="overview-grid">
                  <div className="overview-card">
                    <span className="eyebrow">READ METHODS</span>
                    <strong>{readFns.length}</strong>
                    <small>Available for queries</small>
                  </div>
                  <div className="overview-card">
                    <span className="eyebrow">WRITE METHODS</span>
                    <strong>{writeFns.length}</strong>
                    <small>Require a connected wallet</small>
                  </div>
                  <div className="overview-card">
                    <span className="eyebrow">ACTIVITY</span>
                    <strong>{transactions.length}</strong>
                    <small>Local transactions recorded</small>
                  </div>
                  <div className="overview-note">
                    <Clock3 size={18} />
                    <div>
                      <strong>Ready to interact</strong>
                      <p>
                        This contract is linked to{" "}
                        {selectedContract.networkName}. Use the method tabs to
                        query or write to it.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {detailTab === "transactions" && (
                <div className="activity-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">ACTIVITY LOG</p>
                      <h3>Transactions</h3>
                    </div>
                    <span className="local-badge">LOCAL ONLY</span>
                  </div>
                  {transactions.length ? (
                    transactions.map((transaction) => (
                      <div
                        className="transaction-row"
                        key={`${transaction.hash}-${transaction.time}`}
                      >
                        <span className="transaction-status" />
                        <div>
                          <strong>{transaction.functionName}</strong>
                          <small className="mono">
                            {shortenAddress(transaction.hash)}
                          </small>
                        </div>
                        <span className="transaction-confirmed">
                          {transaction.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-inline">
                      Transactions sent from this console will appear here.
                    </p>
                  )}
                </div>
              )}
              {detailTab === "abi" && (
                <div className="abi-detail">
                  <AbiViewer abi={abi} />
                </div>
              )}
              {(detailTab === "read" || detailTab === "write") && (
                <div className="method-list">
                  {(detailTab === "read" ? readFns : writeFns).map(
                    (fn, idx) => (
                      <FunctionCard
                        key={`${fn.name} ${idx}`}
                        fn={fn}
                        expanded={expanded === fn.name}
                        values={values[fn.name] ?? emptyValues}
                        result={results[fn.name]}
                        isWrite={detailTab === "write"}
                        onToggle={toggleExpanded}
                        onChange={changeValue}
                        onRun={runFunction}
                      />
                    ),
                  )}
                </div>
              )}
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
