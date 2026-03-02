import { useMemo, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { enUS, jaJP, zhCN } from "@mui/x-date-pickers/locales";
import { useTranslation } from "react-i18next";

import { AuthProvider } from "./auth/AuthContext";
import { buildTheme } from "./theme";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { AdminTransactionsPage } from "./pages/AdminTransactionsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { TagsPage } from "./pages/TagsPage";
import { UsersPage } from "./pages/UsersPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ToastProvider } from "./components/ToastProvider";

export default function App() {
  const { i18n } = useTranslation();
  const saved = (localStorage.getItem("theme") as "light" | "dark" | null) || "light";
  const [mode, setMode] = useState<"light" | "dark">(saved);
  const theme = useMemo(() => buildTheme(mode), [mode]);

  const adapterLocale = i18n.language === "zh" ? "zh-cn" : i18n.language === "ja" ? "ja" : "en";
  const localeText = useMemo(() => {
    const lang = i18n.language;
    const pack = lang === "zh" ? zhCN : lang === "ja" ? jaJP : enUS;
    return pack.components.MuiLocalizationProvider.defaultProps.localeText;
  }, [i18n.language]);

  function toggleTheme() {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    localStorage.setItem("theme", next);
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={adapterLocale} localeText={localeText}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <AppLayout mode={mode} toggleTheme={toggleTheme} />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="transactions" element={<TransactionsPage />} />
                  <Route path="tags" element={<TagsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route
                    path="admin/transactions"
                    element={
                      <AdminRoute>
                        <AdminTransactionsPage />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="admin/categories"
                    element={
                      <AdminRoute>
                        <CategoriesPage />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="admin/users"
                    element={
                      <AdminRoute>
                        <UsersPage />
                      </AdminRoute>
                    }
                  />
                </Route>
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
