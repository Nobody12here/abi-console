import { Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { HomePage } from "@/pages/HomePage";
import { ImportPage } from "@/pages/ImportPage";
import { ContractPage } from "@/pages/ContractPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export default function App() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <AppHeader />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route
            path="/contract/:chainId/:address/:tab?"
            element={<ContractPage />}
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border-strong)",
            borderRadius: "6px",
            fontSize: "13px",
            boxShadow: "var(--shadow)",
          },
          success: { iconTheme: { primary: "var(--green)", secondary: "var(--surface)" } },
          error: { iconTheme: { primary: "var(--red)", secondary: "var(--surface)" } },
        }}
      />
    </div>
  );
}
