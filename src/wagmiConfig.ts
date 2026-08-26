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
} from 'wagmi/chains';
console.log(import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID)
export const config = getDefaultConfig({
  appName: 'ABI Console',
  projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID,
  chains: [mainnet, polygon, optimism, arbitrum, base],
  ssr:false
});