import { memo } from "react";
import { ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AbiFunction, Result } from "../types";

type FunctionCardProps = {
  fn: AbiFunction;
  expanded: boolean;
  values: Record<string, string>;
  result?: Result;
  isWrite: boolean;
  wallet: boolean;
  onToggle: (functionName: string) => void;
  onChange: (functionName: string, key: string, value: string) => void;
  onRun: (fn: AbiFunction, isWrite: boolean) => void;
};

export const FunctionCard = memo(function FunctionCard({
  fn,
  expanded,
  values,
  result,
  isWrite,
  wallet,
  onToggle,
  onChange,
  onRun,
}: FunctionCardProps) {
  return (
    <article className={cn("method-card", expanded && "expanded")}>
      <button className="method-header" onClick={() => onToggle(fn.name)}>
        <ChevronRight
          size={16}
          className={cn("chevron", expanded && "rotated")}
        />
        <span className="mono method-name">{fn.name}</span>
        <span className="mono signature">
          ({fn.inputs.map((input) => input.type).join(", ")})
        </span>
        {fn.stateMutability === "payable" && (
          <span className="payable">PAYABLE</span>
        )}
        <span className="method-output">
          {fn.outputs?.[0] ? `-> ${fn.outputs[0].type}` : ""}
        </span>
      </button>
      {expanded && (
        <div className="method-body">
          <div className="method-form">
            {fn.inputs.map((input) => (
              <label key={input.name ?? input.type} className="form-field">
                <span>
                  {input.name || "value"}
                  <em>{input.type}</em>
                </span>
                <input
                  className="field mono"
                  value={values[input.name ?? input.type] ?? ""}
                  onChange={(event) =>
                    onChange(
                      fn.name,
                      input.name ?? input.type,
                      event.target.value,
                    )
                  }
                  placeholder={input.type === "address" ? "0x..." : input.name}
                />
              </label>
            ))}
          </div>
          <div className="run-row">
            <Button
              className={cn(
                "run-button",
                isWrite ? "write-button" : "read-button",
              )}
              disabled={isWrite && !wallet}
              onClick={() => onRun(fn, isWrite)}
            >
              {isWrite ? <Send size={14} /> : null}
              {isWrite ? "Write" : result?.loading ? "Querying..." : "Query"}
            </Button>
            {isWrite && !wallet && (
              <span className="hint">
                Connect a wallet to send transactions
              </span>
            )}
          </div>
          {!isWrite && result && (
            <div className="result">
              <span className="eyebrow">RESULT</span>
              <span className="mono">
                {result.loading ? "Querying..." : String(result.value)}
              </span>
              {result.formatted && <small>{result.formatted}</small>}
            </div>
          )}
        </div>
      )}
    </article>
  );
});
