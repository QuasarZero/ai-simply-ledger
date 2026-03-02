import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { safeParseJson } from "../storage";
import { PaginationBar } from "../components/PaginationBar";

type CurrencyRow = { code: string; name: string; is_enabled: boolean };
type SortDir = "asc" | "desc";
type SortKey = "code" | "name" | "is_enabled";
const STORAGE_KEY = "pageState:adminCurrencies";

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const r = cmp(a.v, b.v);
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.v);
}

export function AdminCurrenciesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<CurrencyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const persisted = useMemo(() => safeParseJson<Record<string, any>>(STORAGE_KEY) || {}, []);
  const [q, setQ] = useState<string>(() => (typeof persisted.q === "string" ? persisted.q : ""));
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const v = persisted.sortKey;
    return v === "code" || v === "name" || v === "is_enabled" ? v : "code";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() =>
    persisted.sortDir === "asc" || persisted.sortDir === "desc" ? persisted.sortDir : "asc"
  );
  const [pageSize, setPageSize] = useState<number>(() => {
    const v = persisted.pageSize;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 50;
  });
  const [page, setPage] = useState<number>(() => {
    const v = persisted.page;
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CurrencyRow | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/admin/currencies");
      setItems((res.data || []) as CurrencyRow[]);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }

  useEffect(() => {
    document.title = `${t("currencies")} | ${t("appTitle")}`;
  }, [t]);

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    const payload = { q, sortKey, sortDir, page, pageSize };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [q, sortKey, sortDir, page, pageSize]);

  const lastQ = useRef(q);
  useEffect(() => {
    if (lastQ.current === q) return;
    lastQ.current = q;
    setPage(0);
  }, [q]);

  function requestSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "code" || nextKey === "name" ? "asc" : "desc");
  }

  const sortedItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = query
      ? items.filter((x) => x.code.toLowerCase().includes(query) || x.name.toLowerCase().includes(query))
      : items;
    const dir = sortDir === "asc" ? 1 : -1;
    return stableSort(base, (a, b) => {
      if (sortKey === "is_enabled") return ((Number(a.is_enabled) - Number(b.is_enabled)) * dir);
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      return a.code.localeCompare(b.code) * dir;
    });
  }, [items, q, sortDir, sortKey]);

  const pagedItems = useMemo(() => {
    const start = page * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, page, pageSize]);

  useEffect(() => {
    if (!loadedOnce) return;
    if (page === 0) return;
    if (page * pageSize >= sortedItems.length) setPage(0);
  }, [loadedOnce, page, pageSize, sortedItems.length]);

  function openCreate() {
    setEditing(null);
    setCode("");
    setName("");
    setEnabled(true);
    setOpen(true);
  }

  function openEdit(x: CurrencyRow) {
    setEditing(x);
    setCode(x.code);
    setName(x.name);
    setEnabled(!!x.is_enabled);
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) return;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/admin/currencies/${trimmedCode}`, { name: trimmedName, is_enabled: enabled });
      } else {
        await api.post("/admin/currencies", { code: trimmedCode, name: trimmedName, is_enabled: enabled });
      }
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleRow(x: CurrencyRow, next: boolean) {
    await api.patch(`/admin/currencies/${x.code}`, { is_enabled: next });
    setItems((prev) => prev.map((r) => (r.code === x.code ? { ...r, is_enabled: next } : r)));
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Typography variant="h6">
            {t("currencies")} ({sortedItems.length})
          </Typography>
          <Button variant="contained" onClick={openCreate}>
            {t("create")}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <TextField
            label={t("search")}
            placeholder={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            size="small"
            sx={{ width: 260 }}
          />
        </Stack>

        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ tableLayout: "fixed", minWidth: 700 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 120 }} sortDirection={sortKey === "code" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "code"}
                    direction={sortKey === "code" ? sortDir : "asc"}
                    onClick={() => requestSort("code")}
                  >
                    {t("code")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === "name" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "name"}
                    direction={sortKey === "name" ? sortDir : "asc"}
                    onClick={() => requestSort("name")}
                  >
                    {t("name")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 140 }} sortDirection={sortKey === "is_enabled" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "is_enabled"}
                    direction={sortKey === "is_enabled" ? sortDir : "desc"}
                    onClick={() => requestSort("is_enabled")}
                  >
                    {t("enabled")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 120 }}>{t("actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedItems.map((x) => (
                <TableRow key={x.code}>
                  <TableCell>{x.code}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {x.name}
                  </TableCell>
                  <TableCell>
                    <Checkbox checked={!!x.is_enabled} onChange={(e) => toggleRow(x, e.target.checked)} />
                  </TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => openEdit(x)}>
                      {t("edit")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={sortedItems.length}
          onChangePage={setPage}
          onChangePageSize={(n) => {
            setPage(0);
            setPageSize(n);
          }}
        />
      </Paper>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        }}
      >
        <DialogTitle>{editing ? t("edit") : t("create")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("code")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!!editing}
              autoFocus
            />
            <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <Typography variant="body2">{t("enabled")}</Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            onClick={save}
            variant="contained"
            disabled={saving || !code.trim() || !name.trim()}
          >
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
