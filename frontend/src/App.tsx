import React, { useMemo, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

import { AuthProvider } from "./auth/AuthContext";
import { buildTheme } from "./theme";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { AdminTransactionsPage } from "./pages/AdminTransactionsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { TagsPage } from "./pages/TagsPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  const saved = (localStorage.getItem("theme") as "light" | "dark" | null) || "light";
  const [mode, setMode] = useState<"light" | "dark">(saved);
  const theme = useMemo(() => buildTheme(mode), [mode]);

  function toggleTheme() {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    localStorage.setItem("theme", next);
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
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
                  path="admin/tags"
                  element={
                    <AdminRoute>
                      <TagsPage />
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
        </AuthProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

