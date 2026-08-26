import { useMemo, useState } from "react"
import { Braces, Check, ChevronDown, ChevronRight, CircleHelp, Copy, FileJson, Moon, Send, Settings2, Share2, Sun, Upload, Wallet, X, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import "./App.css"

type AbiInput = { name?: string; type: string }
type AbiFunction = { name: string; type: "function"; stateMutability: "view" | "pure" | "nonpayable" | "payable"; inputs: AbiInput[]; outputs?: AbiInput[] }
type Network = { id: string; name: string; color: string }
type Result = { value: string | boolean; formatted?: string; loading?: boolean }

const networks: Network[] = [
  { id: "eth", name: "Ethereum", color: "#8b9cff" },
  { id: "poly", name: "Polygon", color: "#b388ff" },
  { id: "bsc", name: "BNB Chain", color: "#f2bd62" },
  { id: "arb", name: "Arbitrum", color: "#62d9ec" },
]

const functionRows: [string, AbiFunction["stateMutability"], AbiInput[], string | undefined][] = [
  ["name", "view", [], "string"], ["symbol", "view", [], "string"], ["decimals", "view", [], "uint8"],
  ["totalSupply", "view", [], "uint256"], ["balanceOf", "view", [{ name: "account", type: "address" }], "uint256"],
  ["allowance", "view", [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], "uint256"],
  ["owner", "view", [], "address"], ["paused", "view", [], "bool"],
  ["transfer", "nonpayable", [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], "bool"],
  ["approve", "nonpayable", [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], "bool"],
  ["transferFrom", "nonpayable", [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }], "bool"],
  ["mint", "nonpayable", [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], undefined],
  ["batchTransfer", "nonpayable", [{ name: "recipients", type: "address[]" }, { name: "amounts", type: "uint256[]" }], undefined],
  ["pause", "nonpayable", [], undefined], ["unpause", "nonpayable", [], undefined], ["deposit", "payable", [], undefined],
]
const demoAbi: AbiFunction[] = functionRows.map(([name, stateMutability, inputs, output]) => ({ name, type: "function", stateMutability, inputs, outputs: output ? [{ type: output }] : [] }))
const contractAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"

function App() {
  const [abi, setAbi] = useState<AbiFunction[] | null>(null)
  const [importMode, setImportMode] = useState<"address" | "paste" | "upload">("address")
  const [address, setAddress] = useState("")
  const [paste, setPaste] = useState("")
  const [error, setError] = useState("")
  const [network, setNetwork] = useState(networks[0])
  const [networkOpen, setNetworkOpen] = useState(false)
  const [wallet, setWallet] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [dark, setDark] = useState(true)
  const [tab, setTab] = useState<"read" | "write">("read")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [results, setResults] = useState<Record<string, Result>>({})
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState("")
  const readFns = useMemo(() => (abi ?? []).filter((fn) => fn.stateMutability === "view" || fn.stateMutability === "pure"), [abi])
  const writeFns = useMemo(() => (abi ?? []).filter((fn) => fn.stateMutability === "nonpayable" || fn.stateMutability === "payable"), [abi])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600) }
  const loadAbi = (nextAbi: AbiFunction[]) => { setAbi(nextAbi); setExpanded(null); setResults({}); notify(`ABI loaded - ${nextAbi.length} functions found`) }
  const parseAbi = () => { try { const parsed = JSON.parse(paste) as AbiFunction[]; const functions = parsed.filter((item) => item.type === "function"); if (!functions.length) throw new Error(); loadAbi(functions); setError("") } catch { setError("Paste a valid ABI JSON array with function entries.") } }
  const runFunction = (fn: AbiFunction, isWrite: boolean) => {
    if (isWrite) { notify(`${fn.name}() transaction submitted`); return }
    setResults((current) => ({ ...current, [fn.name]: { value: "", loading: true } }))
    window.setTimeout(() => {
      const known: Record<string, Result> = { name: { value: "Demo Token" }, symbol: { value: "DEMO" }, decimals: { value: "18" }, totalSupply: { value: "1000000", formatted: "1,000,000 DEMO" }, balanceOf: { value: "48,210", formatted: "48,210 DEMO" }, owner: { value: contractAddress }, paused: { value: false }, allowance: { value: "8,500", formatted: "8,500 DEMO" } }
      setResults((current) => ({ ...current, [fn.name]: known[fn.name] ?? { value: "0x8b5e...c912" } }))
    }, 450)
  }
  const copyAddress = () => { void navigator.clipboard?.writeText(contractAddress); setCopied(true); window.setTimeout(() => setCopied(false), 1200) }

  return <div className={cn("app-shell", !dark && "light-mode")}>
    <header className="topbar"><div className="topbar-inner"><div className="brand"><div className="brand-mark"><Braces size={17} /></div><span>ABI <i>/</i> Console</span><span className="preview-tag">PREVIEW</span></div><div className="nav-actions">
      <div className="menu-wrap"><Button variant="outline" size="sm" onClick={() => setNetworkOpen(!networkOpen)}><span className="network-dot" style={{ background: network.color }} />{network.name}<ChevronDown size={14} /></Button>{networkOpen && <Menu><p className="menu-label">NETWORK</p>{networks.map((item) => <button key={item.id} className="menu-item" onClick={() => { setNetwork(item); setNetworkOpen(false) }}><span className="network-dot" style={{ background: item.color }} />{item.name}{network.id === item.id && <Check size={14} className="menu-check" />}</button>)}</Menu>}</div>
      <Button variant="outline" size="icon" aria-label="Developer toolbox"><Settings2 size={16} /></Button><Button variant="outline" size="icon" aria-label="Share workspace"><Share2 size={16} /></Button><Button variant="outline" size="icon" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</Button>
      <div className="menu-wrap">{!wallet ? <Button onClick={() => { setWallet(true); notify("Wallet connected") }}><Wallet size={15} />Connect wallet</Button> : <><Button variant="outline" size="sm" onClick={() => setWalletOpen(!walletOpen)}><span className="status-dot" />0x91c...2a8d<ChevronDown size={14} /></Button>{walletOpen && <Menu><button className="menu-item" onClick={() => { void navigator.clipboard?.writeText("0x91c...2a8d"); setWalletOpen(false) }}><Copy size={14} />Copy address</button><button className="menu-item danger" onClick={() => { setWallet(false); setWalletOpen(false) }}><X size={14} />Disconnect</button></Menu>}</>}</div>
    </div></div></header>
    <main className="workspace"><aside className="sidebar"><section className="panel import-panel"><div className="panel-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Contract</h1></div>{abi && <span className="loaded"><Check size={13} /> ABI loaded</span>}</div><div className="segmented">{([["address", "Address"], ["paste", "Paste ABI"], ["upload", "Upload"]] as const).map(([id, label]) => <button key={id} className={cn(importMode === id && "selected")} onClick={() => setImportMode(id)}>{label}</button>)}</div>
      {importMode === "address" && <div className="form-stack"><label className="field-label">CONTRACT ADDRESS</label><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x... contract address" className="field mono" /><Button className="action-button" onClick={() => { loadAbi(demoAbi); setAddress(address || contractAddress); setError("") }}><Zap size={15} />Fetch ABI <ChevronRight size={15} /></Button></div>}
      {importMode === "paste" && <div className="form-stack"><label className="field-label">ABI JSON</label><textarea value={paste} onChange={(event) => setPaste(event.target.value)} placeholder='[{"type":"function","name":"balanceOf"}]' className="field mono textarea" /><Button className="action-button" onClick={parseAbi}><Braces size={15} />Parse ABI</Button></div>}
      {importMode === "upload" && <button className="upload-zone" onClick={() => loadAbi(demoAbi)}><Upload size={20} /><span>Drop ABI JSON here</span><small>or click to browse files</small></button>}
      {error && <p className="error"><CircleHelp size={14} />{error}</p>}{abi && <div className="contract-row"><span className="identicon" /><span className="mono">0x742d...8f44e</span><button onClick={copyAddress} aria-label="Copy contract address">{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>}
    </section>{abi && <AbiViewer abi={abi} />}</aside>
    <section className="content-area">{!abi ? <EmptyState onLoad={() => loadAbi(demoAbi)} /> : <><div className="content-heading"><div><p className="eyebrow">INTERACTION SURFACE</p><h2>Contract methods</h2></div><div className="method-tabs"><button className={cn(tab === "read" && "active-read")} onClick={() => setTab("read")}>Read <span>{readFns.length}</span></button><button className={cn(tab === "write" && "active-write")} onClick={() => setTab("write")}>Write <span>{writeFns.length}</span></button></div></div><div className="method-list">{(tab === "read" ? readFns : writeFns).map((fn) => <FunctionCard key={fn.name} fn={fn} expanded={expanded === fn.name} values={values[fn.name] ?? {}} result={results[fn.name]} isWrite={tab === "write"} wallet={wallet} onToggle={() => setExpanded(expanded === fn.name ? null : fn.name)} onChange={(key, value) => setValues({ ...values, [fn.name]: { ...(values[fn.name] ?? {}), [key]: value } })} onRun={() => runFunction(fn, tab === "write")} />)}</div></>}</section></main>
    {toast && <div className="toast"><Check size={15} />{toast}</div>}
  </div>
}

function Menu({ children }: { children: React.ReactNode }) { return <div className="menu">{children}</div> }
function EmptyState({ onLoad }: { onLoad: () => void }) { return <div className="empty-state"><div className="empty-icon"><Braces size={22} /></div><p className="eyebrow">READY WHEN YOU ARE</p><h2>Load a contract to begin</h2><p>Fetch an ABI by address, paste your JSON, or upload a local file. The console will generate an interface for every read and write method.</p><Button variant="outline" onClick={onLoad}><FileJson size={15} />Load demo contract</Button></div> }
function AbiViewer({ abi }: { abi: AbiFunction[] }) { const [raw, setRaw] = useState(false); return <section className="panel abi-panel"><div className="panel-heading"><div><p className="eyebrow">SCHEMA</p><h2>ABI <small>{abi.length} functions</small></h2></div><Button variant="ghost" size="sm" onClick={() => setRaw(!raw)}>{raw ? <Braces size={14} /> : <FileJson size={14} />}{raw ? "Tree view" : "Edit JSON"}</Button></div>{raw ? <pre className="raw-abi">{JSON.stringify(abi, null, 2)}</pre> : <div className="abi-list">{abi.map((fn) => <div className="abi-item" key={fn.name}><span className={cn("type-dot", fn.stateMutability)} /><span className="mono name">{fn.name}</span><span className="mono signature">({fn.inputs.map((input) => input.type).join(", ")})</span>{fn.outputs?.[0] && <span className="mono output">-&gt; {fn.outputs[0].type}</span>}</div>)}</div>}</section> }
function FunctionCard({ fn, expanded, values, result, isWrite, wallet, onToggle, onChange, onRun }: { fn: AbiFunction; expanded: boolean; values: Record<string, string>; result?: Result; isWrite: boolean; wallet: boolean; onToggle: () => void; onChange: (key: string, value: string) => void; onRun: () => void }) { return <article className={cn("method-card", expanded && "expanded")}><button className="method-header" onClick={onToggle}><ChevronRight size={16} className={cn("chevron", expanded && "rotated")} /><span className="mono method-name">{fn.name}</span><span className="mono signature">({fn.inputs.map((input) => input.type).join(", ")})</span>{fn.stateMutability === "payable" && <span className="payable">PAYABLE</span>}<span className="method-output">{fn.outputs?.[0] ? `-> ${fn.outputs[0].type}` : ""}</span></button>{expanded && <div className="method-body"><div className="method-form">{fn.inputs.map((input) => <label key={input.name ?? input.type} className="form-field"><span>{input.name || "value"}<em>{input.type}</em></span><input className="field mono" value={values[input.name ?? input.type] ?? ""} onChange={(event) => onChange(input.name ?? input.type, event.target.value)} placeholder={input.type === "address" ? "0x..." : input.name} /></label>)}</div><div className="run-row"><Button className={cn("run-button", isWrite ? "write-button" : "read-button")} disabled={isWrite && !wallet} onClick={onRun}>{isWrite ? <Send size={14} /> : null}{isWrite ? "Write" : result?.loading ? "Querying..." : "Query"}</Button>{isWrite && !wallet && <span className="hint">Connect a wallet to send transactions</span>}</div>{!isWrite && result && <div className="result"><span className="eyebrow">RESULT</span><span className="mono">{result.loading ? "Querying..." : String(result.value)}</span>{result.formatted && <small>{result.formatted}</small>}</div>}</div>}</article> }

export default App
