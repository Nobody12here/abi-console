import { cn } from "@/lib/utils";
import { chainShortName } from "@/lib/chains";

const TONE: Record<number, string> = {
  1: "chain-blue",
  11155111: "chain-amber",
  8453: "chain-blue",
  84532: "chain-amber",
  42161: "chain-blue",
  421614: "chain-amber",
  10: "chain-red",
  11155420: "chain-amber",
  137: "chain-violet",
  80002: "chain-amber",
  56: "chain-amber",
  97: "chain-amber",
  31337: "chain-teal",
};

export function ChainBadge({
  chainId,
  className,
  showDot = true,
}: {
  chainId: number;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <span
      className={cn("chain-badge", TONE[chainId] ?? "chain-neutral", className)}
      title={`Chain ${chainId}`}
    >
      {showDot && <span className="chain-dot" aria-hidden="true" />}
      {chainShortName(chainId)}
    </span>
  );
}
