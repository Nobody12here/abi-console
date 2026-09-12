import {
  Braces,
  Check,
  ChevronRight,
  CircleHelp,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AbiFunction } from "../types";
import { cn } from "@/lib/utils";
import { config } from "@/wagmiConfig";
import { getChainId } from "@wagmi/core";
import type { ChangeEvent } from "react";
import { type Chain } from 'viem'
type ImportMode = "address" | "paste" | "upload";

type ContractImporterProps = {
  abi: AbiFunction[] | null;
  importMode: ImportMode;
  isLoading: boolean;
  address: string;
  name: string;
  networkId: number;
  networks:Chain[];
  paste: string;
  error: string;
  onLoadingChange: (loading: boolean) => void;
  onModeChange: (mode: ImportMode) => void;
  onAddressChange: (address: string) => void;
  onNameChange: (name: string) => void;
  onNetworkChange: (networkId: number) => void;
  onPasteChange: (paste: string) => void;
  onFetch: (abi: AbiFunction[]) => void;
  onError: (error: string) => void;
  onParse: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onCopyAddress: () => void;
};

const modes: Array<[ImportMode, string]> = [
  ["address", "Address"],
  ["paste", "Paste ABI"],
  ["upload", "Upload"],
];
const ETHERSCAN_API_URL = import.meta.env.VITE_ETHERSCAN_ABI_API;

const fetchContractABI = async (address: string,chainid:number) => {
  const res = await fetch(
    `${ETHERSCAN_API_URL}&module=contract&action=getabi&chainid=${chainid}&address=${address}`,
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
  name,
  networkId,
  networks,
  paste,
  error,
  isLoading,
  onLoadingChange,
  onModeChange,
  onAddressChange,
  onNameChange,
  onNetworkChange,
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
            <Check size={13} strokeWidth={2.2} /> ABI loaded
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
      <div className="form-stack mb-2">
        <label className="field-label" htmlFor="contract-name">
          CONTRACT NAME
        </label>
        <input
          id="contract-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g. Treasury"
          className="field"
        />
      </div>
      <div className="form-stack mb-2">
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
      </div>
      <div className="form-stack mb-2">
        <label className="field-label" htmlFor="contract-network">
          NETWORK
        </label>
        <select
          id="contract-network"
          value={networkId}
          onChange={(event) => onNetworkChange(parseInt(event.target.value))}
          className="field"
        >
          {networks.map((network) => (
            <option key={network.id} value={network.id}>
              {network.name}
            </option>
          ))}
        </select>
      </div>

      {importMode === "address" && (
        <div className="form-stack">
          <Button
            className="action-button"
            onClick={async () => {
              let abi: AbiFunction[] = [];
              onLoadingChange(true);
              try {
                abi = (await fetchContractABI(address,networkId)) as AbiFunction[];
                onFetch(abi);
              } catch (e) {
                onError(e instanceof Error ? e.message : "Unknown Error");
              } finally {
                onLoadingChange(false);
              }
            }}
            disabled={isLoading}
          >
            <Zap size={15} strokeWidth={2.1} />
            Fetch ABI <ChevronRight size={15} strokeWidth={2.1} />
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
          <Button
            className="action-button"
            onClick={onParse}
            disabled={!address}
          >
            <Braces size={15} strokeWidth={2.1} />
            Parse ABI
          </Button>
        </div>
      )}
      {importMode === "upload" && (
        <label className="upload-zone">
          <input
            type="file"
            accept=".json,application/json"
            onChange={onUpload}
          />
          <Upload size={20} strokeWidth={1.9} />
          <span>Drop ABI JSON here</span>
          <small>or click to browse files</small>
        </label>
      )}
      {error && (
        <p className="error">
          <CircleHelp size={14} strokeWidth={2} />
          {error}
        </p>
      )}
      {abi && (
        <div className="contract-row">
          <span className="identicon" />
          <span className="mono">{address}</span>
          <button onClick={onCopyAddress} aria-label="Copy contract address">
          
              <Check size={14} strokeWidth={2.2} />
            
          </button>
        </div>
      )}
    </section>
  );
}
