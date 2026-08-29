import {
  Braces,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AbiFunction } from "../types";
import { cn } from "@/lib/utils";
import { config } from "@/wagmiConfig";
import { getChainId } from "@wagmi/core";
type ImportMode = "address" | "paste" | "upload";

type ContractImporterProps = {
  abi: AbiFunction[] | null;
  importMode: ImportMode;
  isLoading:boolean;
  address: string;
  paste: string;
  error: string;
  copied: boolean;
  onModeChange: (mode: ImportMode) => void;
  onAddressChange: (address: string) => void;
  onPasteChange: (paste: string) => void;
  onFetch: (abi: AbiFunction[]) => void;
  onError: (error: string) => void;
  onParse: () => void;
  onUpload: () => void;
  onCopyAddress: () => void;
};

const modes: Array<[ImportMode, string]> = [
  ["address", "Address"],
  ["paste", "Paste ABI"],
  ["upload", "Upload"],
];
const ETHERSCAN_API_URL = import.meta.env.VITE_ETHERSCAN_ABI_API;

const fetchContractABI = async (address: string) => {
  const res = await fetch(
    `${ETHERSCAN_API_URL}&module=contract&action=getabi&chainid=${getChainId(config)}&address=${address}`,
  );
  if (!res.ok) throw new Error("Error fetching contract ABI...");
  let data = await res.json();
  if (data.status !== "1")
    throw new Error(data.result || "Contract ABI not found !");
  return JSON.parse(data.result.toString());
};

export function ContractImporter({
  abi,
  importMode,
  address,
  paste,
  error,
  copied,
  isLoading,
  onModeChange,
  onAddressChange,
  onPasteChange,
  onFetch,
  onError,
  onParse,
  onUpload,
  onCopyAddress,
}: ContractImporterProps) {
  return (
    <section className="panel import-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1>Contract</h1>
        </div>
        {abi && (
          <span className="loaded">
            <Check size={13} /> ABI loaded
          </span>
        )}
      </div>
      <div className="segmented">
        {modes.map(([id, label]) => (
          <button
            key={id}
            className={cn(importMode === id && "selected")}
            onClick={() => onModeChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {importMode === "address" && (
        <div className="form-stack">
          <label className="field-label" htmlFor="contract-address">
            CONTRACT ADDRESS
          </label>
          <input
            id="contract-address"
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="0x... contract address"
            className="field mono"
          />
          <Button
            className="action-button"
            onClick={async () => {
              let abi: AbiFunction[] = [];
              try {
                abi = (await fetchContractABI(address)) as AbiFunction[];
                onFetch(abi);
              } catch (e) {
                onError(e instanceof Error ? e.message : "Unknown Error");
              }
            }}
            disabled={isLoading}
          >
            <Zap size={15} />
            Fetch ABI <ChevronRight size={15} />
          </Button>
        </div>
      )}
      {importMode === "paste" && (
        <div className="form-stack">
          <label className="field-label" htmlFor="abi-json">
            ABI JSON
          </label>
          <textarea
            id="abi-json"
            value={paste}
            onChange={(event) => onPasteChange(event.target.value)}
            placeholder='[{"type":"function","name":"balanceOf"}]'
            className="field mono textarea"
          />
          <Button className="action-button" onClick={onParse}>
            <Braces size={15} />
            Parse ABI
          </Button>
        </div>
      )}
      {importMode === "upload" && (
        <button className="upload-zone" onClick={onUpload}>
          <Upload size={20} />
          <span>Drop ABI JSON here</span>
          <small>or click to browse files</small>
        </button>
      )}
      {error && (
        <p className="error">
          <CircleHelp size={14} />
          {error}
        </p>
      )}
      {abi && (
        <div className="contract-row">
          <span className="identicon" />
          <span className="mono">{address}</span>
          <button onClick={onCopyAddress} aria-label="Copy contract address">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}
    </section>
  );
}
