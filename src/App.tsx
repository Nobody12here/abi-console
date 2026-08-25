import "./App.css";

import { WagmiProvider } from "wagmi";
import { config } from "./wagmiConfig";
import { Button } from "@/components/ui/button";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function App() {
  return (
    <>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <div className="flex min-h-svh flex-col items-center justify-center">
            <Button>Click me</Button>
          </div>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  );
}

export default App;
