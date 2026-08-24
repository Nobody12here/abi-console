import "./App.css";

import { WagmiProvider } from "wagmi";
import { config } from "./wagmiConfig";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function App() {
  return (
    <>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <p>Hello world</p>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  );
}

export default App;
