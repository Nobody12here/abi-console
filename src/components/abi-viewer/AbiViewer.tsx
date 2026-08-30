import { memo, useState } from "react";
import { Braces, FileJson2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AbiFunction } from "../types";

export const AbiViewer = memo(function AbiViewer({ abi }: { abi: AbiFunction[] }) {
  const [raw, setRaw] = useState(false);

  return (
    <section className="panel abi-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SCHEMA</p>
          <h2>
            ABI <small>{abi.length} functions</small>
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRaw(!raw)}>
          {raw ? (
            <Braces size={14} strokeWidth={1.8} />
          ) : (
            <FileJson2 size={14} strokeWidth={1.8} />
          )}
          {raw ? "Tree view" : "Edit JSON"}
        </Button>
      </div>
      {raw ? (
        <pre className="raw-abi">{JSON.stringify(abi, null, 2)}</pre>
      ) : (
        <div className="abi-list">
          {abi.map((fn,idx) => (
            <div className="abi-item" key={`${fn.name} ${idx}`}>
              <span className={cn("type-dot", fn.stateMutability)} />
              <span className="mono name">{fn.name}</span>
              <span className="mono signature">
                ({fn.inputs.map((input) => input.type).join(", ")})
              </span>
              {fn.outputs?.[0] && (
                <span className="mono output">-&gt; {fn.outputs[0].type}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
});
