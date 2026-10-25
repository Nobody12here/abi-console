import { cn } from "@/lib/utils";
import { chainShortName, getChain } from "@/lib/chains";

// Dot colour follows the network family; testnets get a hollow dot.
const FAMILY: Record<number, string> = {
  1: "eth",
  11155111: "eth",
  8453: "base",
  84532: "base",
  42161: "arb",
  421614: "arb",
  10: "op",
  11155420: "op",
  137: "poly",
  80002: "poly",
  56: "bnb",
  97: "bnb",
  31337: "local",
};

export function ChainBadge({
  chainId,
  className,
}: {
  chainId: number;
  className?: string;
}) {
  const testnet = Boolean(getChain(chainId)?.testnet);
  return (
    <span
      className={cn("chain-badge", `chain-${FAMILY[chainId] ?? "other"}`, testnet && "is-testnet", className)}
      title={`Chain ID ${chainId}${testnet ? " (testnet)" : ""}`}
    >
      <span className="chain-dot" aria-hidden="true" />
      {chainShortName(chainId)}
    </span>
  );
}
