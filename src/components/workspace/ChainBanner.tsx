import { ArrowLeftRight, ShieldAlert } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { chainName } from "@/lib/chains";
import { errorMessage } from "@/features/execution/errors";

export function ChainBanner({ contractChainId }: { contractChainId: number }) {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();

  if (!isConnected || chainId === undefined || chainId === contractChainId) {
    return null;
  }

  return (
    <div className="chain-banner" role="status">
      <span className="chain-banner-icon">
        <ShieldAlert size={16} />
      </span>
      <div>
        <strong>Wallet is on the wrong network</strong>
        <p>
          This contract lives on {chainName(contractChainId)}. Your wallet is on{" "}
          {chainName(chainId)}. Writes are disabled until the networks match.
        </p>
      </div>
      <div className="chain-banner-target">
        <ChainBadge chainId={contractChainId} />
      </div>
      <Button
        variant="primary"
        size="sm"
        loading={isPending}
        icon={<ArrowLeftRight size={14} />}
        onClick={async () => {
          try {
            await switchChainAsync({ chainId: contractChainId });
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      >
        Switch wallet
      </Button>
    </div>
  );
}
