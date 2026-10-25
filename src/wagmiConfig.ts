import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { CHAINS } from "@/lib/chains";
import "@rainbow-me/rainbowkit/styles.css";

const transports = Object.fromEntries(
  CHAINS.map((chain) => [chain.id, http()]),
) as Record<number, ReturnType<typeof http>>;

export const config = getDefaultConfig({
  appName: "ABI Console",
  projectId:
    import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: CHAINS as unknown as readonly [
    (typeof CHAINS)[number],
    ...(typeof CHAINS)[number][],
  ],
  transports,
  ssr: false,
});
