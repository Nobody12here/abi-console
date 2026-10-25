import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import type { AbiCounts } from "@/features/abi/types";
import { cn } from "@/lib/utils";

export type ContractTab =
  | "overview"
  | "read"
  | "write"
  | "events"
  | "transactions"
  | "abi";

const TABS: Array<{ id: ContractTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "read", label: "Read" },
  { id: "write", label: "Write" },
  { id: "events", label: "Events" },
  { id: "transactions", label: "Transactions" },
  { id: "abi", label: "ABI" },
];

export function ContractTabs({
  basePath,
  active,
  counts,
  txCount,
}: {
  basePath: string;
  active: ContractTab;
  counts: AbiCounts;
  txCount: number;
}) {
  const countFor = (id: ContractTab): number | undefined => {
    if (id === "read") return counts.readFunctions;
    if (id === "write") return counts.writeFunctions;
    if (id === "events") return counts.events;
    if (id === "transactions") return txCount;
    return undefined;
  };

  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Keep the active tab visible when the strip scrolls horizontally.
  useEffect(() => {
    const nav = navRef.current;
    const tab = activeRef.current;
    if (!nav || !tab) return;
    const navRect = nav.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    if (tabRect.left < navRect.left) {
      nav.scrollLeft -= navRect.left - tabRect.left + 12;
    } else if (tabRect.right > navRect.right) {
      nav.scrollLeft += tabRect.right - navRect.right + 12;
    }
  }, [active]);

  return (
    <nav ref={navRef} className="contract-tabs" aria-label="Contract views">
      {TABS.map((tab) => {
        const count = countFor(tab.id);
        return (
          <NavLink
            key={tab.id}
            ref={active === tab.id ? activeRef : undefined}
            to={`${basePath}/${tab.id}`}
            className={({ isActive }) =>
              cn("contract-tab", (isActive || active === tab.id) && "active")
            }
            aria-current={active === tab.id ? "page" : undefined}
          >
            {tab.label}
            {count !== undefined && <span className="tab-count">{count}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}
