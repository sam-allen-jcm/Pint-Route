import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { CookiesPage } from "./pages/legal/CookiesPage";
import { PrivacyPage } from "./pages/legal/PrivacyPage";
import { TermsPage } from "./pages/legal/TermsPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordResetPages";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { StatsPage } from "./pages/StatsPage";
import { CrawlPage } from "./pages/CrawlPage";
import { NotFound } from "./pages/NotFound";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/c/:slug" element={<CrawlPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
