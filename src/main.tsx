import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { config } from "./wagmiConfig";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { THEME_KEY } from "@/features/storage/workspace";
import App from "./App";

import "@fontsource-variable/jetbrains-mono";
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

// Resolve the theme before the first paint so "system" does not flash dark.
function initialTheme(): "dark" | "light" {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    // Storage can be unavailable; fall back to the OS preference.
  }
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const theme = initialTheme();
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;

function RainbowBridge() {
  const { resolvedTheme } = useWorkspace();
  const walletTheme =
    resolvedTheme === "dark"
      ? darkTheme({
          accentColor: "#3b74e0",
          accentColorForeground: "#ffffff",
          borderRadius: "small",
          fontStack: "system",
        })
      : lightTheme({
          accentColor: "#2563eb",
          accentColorForeground: "#ffffff",
          borderRadius: "small",
          fontStack: "system",
        });

  return (
    <RainbowKitProvider theme={walletTheme} modalSize="compact">
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
