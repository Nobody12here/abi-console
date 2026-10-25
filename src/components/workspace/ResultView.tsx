import type { AbiParameter } from "viem";
import { Braces, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { copyText, toJson } from "@/lib/format";
import { formatInputLabel } from "@/features/abi/utils";
import { CopyButton } from "@/components/ui/CopyButton";

export function ValueView({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="muted">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="mono">{String(value)}</span>;
  }
  if (typeof value === "bigint") {
    return <span className="mono">{value.toString()}</span>;
  }
  if (typeof value === "string") {
    if (value.length === 0) return <span className="muted">""</span>;
    return <span className="mono result-string">{value}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <ol className="result-array">
        {value.map((entry, index) => (
          <li key={index}>
            <span className="result-index mono">[{index}]</span>
            <ValueView value={entry} />
          </li>
        ))}
      </ol>
    );
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      <dl className="result-tuple">
        {Object.entries(record).map(([key, entry]) => (
          <div key={key}>
            <dt className="mono">{key}</dt>
            <dd>
              <ValueView value={entry} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="mono">{String(value)}</span>;
}

export function ResultView({
  outputs,
  value,
  label = "Result",
}: {
  outputs: readonly AbiParameter[];
  value: unknown;
  label?: string;
}) {
  if (value === undefined && outputs.length > 0) return null;

  const isMulti = outputs.length > 1;
  const values = isMulti && Array.isArray(value) ? value : [value];

  return (
    <div className="result-box">
      <div className="result-heading">
        <span className="eyebrow">
          <Braces size={12} /> {label}
        </span>
        <div className="result-heading-actions">
          <button
            type="button"
            className="copy-btn compact"
            aria-label="Copy result as JSON"
            title="Copy result as JSON"
            onClick={async () => {
              try {
                await copyText(toJson(value));
                toast.success("Result copied.");
              } catch {
                toast.error("Could not copy the result.");
              }
            }}
          >
            <Copy size={12} />
          </button>
          <span className="mono result-shape">
            {isMulti ? `${outputs.length} values` : "1 value"}
          </span>
        </div>
      </div>

      {outputs.length === 0 ? (
        <p className="empty-inline">This method returns no values.</p>
      ) : (
        <div className="result-rows">
          {outputs.map((output, index) => (
            <div className="result-row" key={index}>
              <span className="result-label">
                {formatInputLabel(output, index)}
                <em className="mono">{output.type}</em>
              </span>
              <div className="result-value">
                <ValueView value={values[index]} />
                <CopyButton
                  value={
                    typeof values[index] === "string"
                      ? values[index]
                      : toJson(values[index])
                  }
                  label="Copy value"
                  compact
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
