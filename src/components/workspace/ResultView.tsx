import type { AbiParameter } from "viem";
import { toJson } from "@/lib/format";
import { CopyButton } from "@/components/ui/CopyButton";

export function ValueView({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="muted">null</span>;
  }
  if (typeof value === "boolean" || typeof value === "bigint" || typeof value === "number") {
    return <span className="mono">{String(value)}</span>;
  }
  if (typeof value === "string") {
    if (value.length === 0) return <span className="muted">""</span>;
    return <span className="mono break">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="muted">[]</span>;
    return (
      <ol className="result-array">
        {value.map((entry, index) => (
          <li key={index}>
            <span className="result-index mono">{index}</span>
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
    <div className="result">
      <div className="result-heading">
        <span>{label}</span>
        {outputs.length > 0 && (
          <CopyButton value={toJson(value)} label="Copy as JSON" />
        )}
      </div>

      {outputs.length === 0 ? (
        <p className="muted">This function returns nothing.</p>
      ) : (
        <div className="result-rows">
          {outputs.map((output, index) => {
            const entry = values[index];
            return (
              <div className="result-row" key={index}>
                <span className="result-label">
                  {output.name?.trim() ||
                    (outputs.length === 1 ? "Returns" : `Return ${index}`)}
                  <em className="mono">{output.type}</em>
                </span>
                <div className="result-value">
                  <ValueView value={entry} />
                  <CopyButton
                    value={typeof entry === "string" ? entry : toJson(entry)}
                    label="Copy value"
                    compact
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
