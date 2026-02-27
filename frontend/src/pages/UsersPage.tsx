import { useEffect, useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableSortLabel,
  TableRow,
  TextField,
  Typography,
  TableContainer
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import { api } from "../api/client";
import { safeParseJson } from "../storage";

type User = {
  id: number;
  email: string;
  username: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
};
type SortDir = "asc" | "desc";
type SortKey = "email" | "username" | "is_admin" | "is_active";
const STORAGE_KEY = "pageState:users";

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const r = cmp(a.v, b.v);
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.v);
}

export function UsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<User[]>([]);
  const persisted = useMemo(() => safeParseJson<Record<string, any>>(STORAGE_KEY) || {}, []);
  const [q, setQ] = useState<string>(() => (typeof persisted.q === "string" ? persisted.q : ""));
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const v = persisted.sortKey;
    return v === "email" || v === "username" || v === "is_admin" || v === "is_active" ? v : "username";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => (persisted.sortDir === "asc" || persisted.sortDir === "desc" ? persisted.sortDir : "asc"));
  const [actionsAnchorEl, setActionsAnchorEl] = useState<HTMLElement | null>(null);
  const [actionsUser, setActionsUser] = useState<User | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [openReset, setOpenReset] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function load() {
    const res = await api.get("/admin/users");
    setItems(res.data as User[]);
  }

  useEffect(() => {
    const payload = { q, sortKey, sortDir };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [q, sortKey, sortDir]);

  useEffect(() => {
    load().catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setEmail("");
    setUsername("");
    setPassword("");
    setIsAdmin(false);
    setIsActive(true);
    setOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setEmail(u.email);
    setUsername(u.username);
    setPassword("");
    setIsAdmin(u.is_admin);
    setIsActive(u.is_active);
    setOpen(true);
  }

  async function save() {
    if (editing) {
      await api.patch(`/admin/users/${editing.id}`, {
        email,
        username,
        is_admin: isAdmin,
        is_active: isActive
      });
      if (password) {
        await api.post(`/admin/users/${editing.id}/reset-password`, { password });
      }
    } else {
      await api.post("/admin/users", {
        email,
        username,
        password,
        is_admin: isAdmin,
        is_active: isActive
      });
    }
    setOpen(false);
    await load();
  }

  async function del(id: number) {
    await api.delete(`/admin/users/${id}`);
    await load();
  }

  function openResetDialog(u: User) {
    setResetUser(u);
    setResetPassword("");
    setOpenReset(true);
  }

  function openActionsMenu(e: React.MouseEvent<HTMLElement>, u: User) {
    setActionsAnchorEl(e.currentTarget);
    setActionsUser(u);
  }

  function closeActionsMenu() {
    setActionsAnchorEl(null);
    setActionsUser(null);
  }

  async function doReset() {
    if (!resetUser) return;
    await api.post(`/admin/users/${resetUser.id}/reset-password`, { password: resetPassword });
    setOpenReset(false);
  }

  function requestSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("asc");
  }

  const sortedItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = query
      ? items.filter((u) => {
          const userHit = u.username.toLowerCase().includes(query);
          const emailHit = u.email.toLowerCase().includes(query);
          return userHit || emailHit;
        })
      : items;
    const dir = sortDir === "asc" ? 1 : -1;
    return stableSort(base, (a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "email":
          va = a.email;
          vb = b.email;
          break;
        case "username":
          va = a.username;
          vb = b.username;
          break;
        case "is_admin":
          va = a.is_admin ? 1 : 0;
          vb = b.is_admin ? 1 : 0;
          break;
        case "is_active":
          va = a.is_active ? 1 : 0;
          vb = b.is_active ? 1 : 0;
          break;
      }
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [items, q, sortDir, sortKey]);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t("users")}
          </Typography>
          <TextField
            label={t("search")}
            placeholder={t("searchUsersHint")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            size="small"
            sx={{ width: 280 }}
          />
          <Button variant="contained" onClick={openCreate}>
            {t("create")}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 200 }} sortDirection={sortKey === "email" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "email"}
                    direction={sortKey === "email" ? sortDir : "asc"}
                    onClick={() => requestSort("email")}
                  >
                    {t("email")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 110 }} sortDirection={sortKey === "username" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "username"}
                    direction={sortKey === "username" ? sortDir : "asc"}
                    onClick={() => requestSort("username")}
                  >
                    {t("username")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 80 }} sortDirection={sortKey === "is_admin" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "is_admin"}
                    direction={sortKey === "is_admin" ? sortDir : "asc"}
                    onClick={() => requestSort("is_admin")}
                  >
                    {t("admin")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 70 }} sortDirection={sortKey === "is_active" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "is_active"}
                    direction={sortKey === "is_active" ? sortDir : "asc"}
                    onClick={() => requestSort("is_active")}
                  >
                    {t("active")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{width: 120}}>{t("actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => navigate(`/admin/transactions?userId=${u.id}`)}>
                      {u.username}
                    </Button>
                  </TableCell>
                  <TableCell>{u.is_admin ? "Y" : ""}</TableCell>
                  <TableCell>{u.is_active ? "Y" : ""}</TableCell>
                  <TableCell align="left">
                    <ButtonGroup variant="outlined" size="small">
                      <Button onClick={() => openEdit(u)}>{t("edit")}</Button>
                      <Button onClick={(e) => openActionsMenu(e, u)} sx={{ px: 0.5, minWidth: 36 }}>
                        <ArrowDropDownIcon fontSize="small" />
                      </Button>
                    </ButtonGroup>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Menu
        anchorEl={actionsAnchorEl}
        open={!!actionsAnchorEl}
        onClose={closeActionsMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            if (!actionsUser) return;
            const u = actionsUser;
            closeActionsMenu();
            openResetDialog(u);
          }}
        >
          {t("resetPassword")}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (!actionsUser) return;
            const id = actionsUser.id;
            closeActionsMenu();
            del(id);
          }}
        >
          {t("delete")}
        </MenuItem>
      </Menu>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t("edit") : t("create")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label={t("username")} value={username} onChange={(e) => setUsername(e.target.value)} />
            <TextField
              label={t("password")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText={editing ? t("leaveEmptyToKeep") : ""}
            />
            <FormControlLabel
              control={<Switch checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />}
              label={t("admin")}
            />
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label={t("active")}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={save} variant="contained">
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openReset} onClose={() => setOpenReset(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("resetPasswordTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography>{resetUser ? `${resetUser.username} (#${resetUser.id})` : ""}</Typography>
            <TextField
              label={t("newPassword")}
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenReset(false)}>{t("cancel")}</Button>
          <Button onClick={doReset} variant="contained">
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
