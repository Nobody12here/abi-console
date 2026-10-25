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
      <footer className="app-footer">
        <div className="app-footer-inner">
          <span>
            ABI Console · local-first contract workbench
          </span>
          <span className="footer-note">
            ABI is data, not trust. The selector is the ground truth.
          </span>
        </div>
      </footer>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4200,
          style: {
            background: "var(--surface-2)",
            color: "var(--text)",
            border: "1px solid var(--line-strong)",
            borderRadius: "10px",
            fontSize: "13px",
            boxShadow: "var(--shadow-lg)",
          },
          success: { iconTheme: { primary: "var(--green)", secondary: "var(--surface-2)" } },
          error: { iconTheme: { primary: "var(--coral)", secondary: "var(--surface-2)" } },
        }}
      />
    </div>
  );
}
