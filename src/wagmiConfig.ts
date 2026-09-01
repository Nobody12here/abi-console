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
  chains: [sepolia, mainnet, polygon, optimism, arbitrum, base],
  transports: {
    [sepolia.id]: http(`https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}`),
    [mainnet.id]: http(`https://mainnet.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}`),
    [arbitrum.id]: http(`https://arbitrum-mainnet.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}`),
    [base.id]: http(`https://base-mainnet.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}`),
    [polygon.id]: http(`https://polygon-mainnet.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}`),
    [optimism.id]: http(`https://optimism-mainnet.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}`)

  },
  ssr: false
});