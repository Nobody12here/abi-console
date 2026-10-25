import { TriangleAlert } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { chainName } from "@/lib/chains";
import { errorMessage } from "@/features/execution/errors";

export function ChainBanner({ contractChainId }: { contractChainId: number }) {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();

  if (!isConnected || chainId === undefined || chainId === contractChainId) {
    return null;
  }

  return (
    <div className="notice warning" role="status">
      <TriangleAlert size={16} />
      <div>
        Your wallet is on <strong>{chainName(chainId)}</strong>, but this
        contract is on <strong>{chainName(contractChainId)}</strong>. Switch
        networks to send transactions.
      </div>
      <Button
        size="sm"
        loading={isPending}
        onClick={async () => {
          try {
            await switchChainAsync({ chainId: contractChainId });
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      >
        Switch to {chainName(contractChainId)}
      </Button>
    </div>
  );
}
