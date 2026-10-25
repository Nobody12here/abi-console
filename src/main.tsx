import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { config } from "./wagmiConfig";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import App from "./App";

import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import "./styles/app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

const initialTheme =
  localStorage.getItem("abiconsole:theme") === "light" ? "light" : "dark";
document.documentElement.dataset.theme = initialTheme;
document.documentElement.style.colorScheme = initialTheme;

function RainbowBridge() {
  const { resolvedTheme } = useWorkspace();
  const theme =
    resolvedTheme === "dark"
      ? darkTheme({
          accentColor: "#7de3d4",
          accentColorForeground: "#07120f",
          borderRadius: "medium",
          fontStack: "system",
        })
      : lightTheme({
          accentColor: "#0f766e",
          accentColorForeground: "#ffffff",
          borderRadius: "medium",
          fontStack: "system",
        });

  return (
    <RainbowKitProvider theme={theme} modalSize="compact">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RainbowKitProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <WorkspaceProvider>
            <RainbowBridge />
          </WorkspaceProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </StrictMode>,
);
