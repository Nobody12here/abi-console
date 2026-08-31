import '@rainbow-me/rainbowkit/styles.css';
import {
  getDefaultConfig,
} from '@rainbow-me/rainbowkit';

import {
  mainnet,
  polygon,
  optimism,
  arbitrum,
  base,
  sepolia
} from 'wagmi/chains';
import { http } from 'wagmi';
export const config = getDefaultConfig({
  appName: 'ABI Console',
  projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID,
  chains: [mainnet, polygon, optimism, arbitrum, base,sepolia],
  transports:{
    [sepolia.id]:http("https://sepolia.infura.io/v3/bb27752d9dc94ef8bb759f8f4a4083d6")
  },
  ssr:false
});