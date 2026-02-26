import React, { useMemo } from "react";
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import i18n from "../i18n";

const drawerWidth = 240;

export function AppLayout({
  mode,
  toggleTheme
}: {
  mode: "light" | "dark";
  toggleTheme: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { me, logout } = useAuth();

  const items = useMemo(() => {
    const base = [
      { to: "/", label: t("dashboard") },
      { to: "/transactions", label: t("transactions") },
      { to: "/tags", label: t("tags") },
      { to: "/profile", label: t("profile") }
    ];
    if (me?.is_admin) {
      base.push({ to: "/admin/transactions", label: t("adminTransactions") });
      base.push({ to: "/admin/categories", label: t("categories") });
      base.push({ to: "/admin/users", label: t("users") });
    }
    return base;
  }, [me?.is_admin, t]);

  function go(to: string) {
    navigate(to);
    setOpen(false);
  }

  function switchLang() {
    const next = i18n.language === "zh" ? "en" : "zh";
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
  }

  const drawer = (
    <Box sx={{ width: drawerWidth }}>
      <Toolbar>
        <Typography variant="h6">{t("appTitle")}</Typography>
      </Toolbar>
      <Divider />
      <List>
        {items.map((it) => (
          <ListItemButton
            key={it.to}
            selected={location.pathname === it.to}
            onClick={() => go(it.to)}
          >
            <ListItemText primary={it.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {me ? `${me.username}${me.is_admin ? " (admin)" : ""}` : ""}
          </Typography>
          <Button color="inherit" onClick={switchLang}>
            {t("language")}: {i18n.language.toUpperCase()}
          </Button>
          <IconButton color="inherit" onClick={toggleTheme} sx={{ ml: 1 }}>
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
          <Button color="inherit" onClick={() => logout()}>
            {t("logout")}
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer open={open} onClose={() => setOpen(false)}>
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
