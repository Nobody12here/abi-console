import { useMemo, useState } from "react";
import { Braces, Search, SearchX } from "lucide-react";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import {
  type AbiFunctionItem,
  functionSignature,
  functionSelector,
  searchFunction,
} from "@/features/abi/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { MethodCard } from "./MethodCard";

export function MethodList({
  contract,
  revision,
  functions,
  mode,
}: {
  contract: ContractBinding;
  revision: AbiRevision;
  functions: AbiFunctionItem[];
  mode: "read" | "write";
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () => functions.filter((fn) => searchFunction(fn, query)),
    [functions, query],
  );

  if (functions.length === 0) {
    return (
      <EmptyState
        icon={<Braces size={22} />}
        eyebrow="EMPTY SURFACE"
        title={
          mode === "read"
            ? "This ABI has no readable methods"
            : "This ABI has no write methods"
        }
        description={
          mode === "read"
            ? "Only view and pure functions appear here. Check the ABI tab if you expected a read method."
            : "Only nonpayable and payable functions appear here. Events, errors, and reads are listed elsewhere."
        }
      />
    );
  }

  return (
    <div className="method-list">
      <div className="method-toolbar">
        <label className="search-field">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, signature, or selector"
            aria-label={`Search ${mode} methods`}
            spellCheck={false}
          />
        </label>
        <div className="method-toolbar-meta">
          <span>
            {filtered.length} of {functions.length} methods
          </span>
          {query && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuery("")}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX size={22} />}
          eyebrow="NO MATCH"
          title="No methods match that search"
          description={
            <>
              Try a function name like <code>balanceOf</code>, a full signature,
              or a selector like <code>0x00fdd58e</code>.
            </>
          }
          action={
            <Button variant="secondary" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="method-cards">
          {filtered.map((fn) => {
            const signature = functionSignature(fn);
            return (
              <MethodCard
                key={`${signature}:${functionSelector(fn)}`}
                contract={contract}
                revision={revision}
                fn={fn}
                mode={mode}
                open={expanded === signature}
                onToggle={() =>
                  setExpanded((current) =>
                    current === signature ? null : signature,
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
