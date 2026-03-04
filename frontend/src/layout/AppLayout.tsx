import * as React from "react";
import { useMemo } from "react";
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
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
import dayjs from "../dayjs";

const drawerWidth = 240;
const LANG_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" }
] as const;
type LangValue = (typeof LANG_OPTIONS)[number]["value"];

function normalizeLang(value: string | undefined | null): LangValue {
  const v = (value || "zh").toLowerCase();
  if (v.startsWith("zh")) return "zh";
  if (v.startsWith("ja")) return "ja";
  return "en";
}

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
      { to: "/tags", label: t("tags") }
    ];
    if (me?.is_admin) {
      base.push({ to: "/admin/transactions", label: t("adminTransactions") });
      base.push({ to: "/admin/categories", label: t("categories") });
      base.push({ to: "/admin/currencies", label: t("currencies") });
      base.push({ to: "/admin/users", label: t("users") });
      base.push({ to: "/admin/fx-rates", label: t("fxRates") });
    }
    return base;
  }, [me?.is_admin, t]);

  const bottomItems = useMemo(() => [{ to: "/profile", label: t("profile") }], [t]);

  const pageTitle = useMemo(() => {
    // Use longest match so "/admin/transactions" wins over "/" etc.
    const match = [...items, ...bottomItems]
      .sort((a, b) => b.to.length - a.to.length)
      .find((it) => (it.to === "/" ? location.pathname === "/" : location.pathname.startsWith(it.to)));
    return match?.label || "";
  }, [bottomItems, items, location.pathname]);

  React.useEffect(() => {
    const app = t("appTitle");
    document.title = pageTitle ? `${pageTitle} | ${app}` : app;
  }, [pageTitle, t]);

  function go(to: string) {
    navigate(to);
    setOpen(false);
  }

  function setLang(next: LangValue) {
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
    dayjs.locale(next === "zh" ? "zh-cn" : next);
  }

  const drawer = (
    <Box sx={{ width: drawerWidth, height: "100vh", display: "flex", flexDirection: "column" }}>
      <Toolbar>
        <Typography variant="h6">{t("appTitle")}</Typography>
      </Toolbar>
      <Divider />
      <List sx={{ flexGrow: 1 }}>
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
      <Divider />
      <List>
        {bottomItems.map((it) => (
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
          <FormControl size="small" variant="standard" sx={{ minWidth: 120 }}>
            <Select
              value={normalizeLang(i18n.language)}
              onChange={(e) => setLang(e.target.value as LangValue)}
              disableUnderline
              sx={{
                color: "inherit",
                "& .MuiSelect-icon": { color: "inherit" },
                "& .MuiSelect-select": { py: 0.5 }
              }}
              renderValue={(value) => LANG_OPTIONS.find((x) => x.value === value)?.label || String(value)}
            >
              {LANG_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
