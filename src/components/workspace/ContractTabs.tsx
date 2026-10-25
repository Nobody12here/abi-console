import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { AbiCounts } from "@/features/abi/types";
import { cn } from "@/lib/utils";
import { CONTRACT_TABS, type ContractTab } from "./tabs";

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
    if (id === "transactions") return txCount || undefined;
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
    <nav ref={navRef} className="tabs" aria-label="Contract views">
      {CONTRACT_TABS.map((tab) => {
        const count = countFor(tab.id);
        const isActive = active === tab.id;
        return (
          <Link
            key={tab.id}
            ref={isActive ? activeRef : undefined}
            to={tab.id === "read" ? basePath : `${basePath}/${tab.id}`}
            replace
            className={cn("tab", isActive && "active")}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
            {count !== undefined && <span className="tab-count">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
