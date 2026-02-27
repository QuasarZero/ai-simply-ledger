import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableSortLabel,
  TableRow,
  TextField,
  Typography,
  Box
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { useConfirm } from "../hooks/useConfirm";
import { useAuth } from "../auth/AuthContext";
import { safeParseJson } from "../storage";
import { PaginationBar } from "../components/PaginationBar";

type TagWithUsage = { id: number; name: string; used_count?: number };
type SortDir = "asc" | "desc";
type SortKey = "name" | "used_count";
const STORAGE_KEY = "pageState:tags";

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const r = cmp(a.v, b.v);
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.v);
}

export function TagsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const { me } = useAuth();
  const [items, setItems] = useState<TagWithUsage[]>([]);
  const persisted = useMemo(() => safeParseJson<Record<string, any>>(STORAGE_KEY) || {}, []);
  const [q, setQ] = useState<string>(() => (typeof persisted.q === "string" ? persisted.q : ""));
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const v = persisted.sortKey;
    return v === "name" || v === "used_count" ? v : "used_count";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => (persisted.sortDir === "asc" || persisted.sortDir === "desc" ? persisted.sortDir : "desc"));
  const [pageSize, setPageSize] = useState<number>(() => {
    const v = persisted.pageSize;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 20;
  });
  const [page, setPage] = useState<number>(() => {
    const v = persisted.page;
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TagWithUsage | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await api.get("/tags");
    setItems(res.data as TagWithUsage[]);
    setSelectedIds(new Set());
  }

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
    setSelectedIds(new Set());
  }, [q]);

  function openCreate() {
    setEditing(null);
    setName("");
    setOpen(true);
  }

  function openEdit(x: TagWithUsage) {
    setEditing(x);
    setName(x.name);
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/tags/${editing.id}`, { name });
      } else {
        await api.post("/tags", { name });
      }
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number) {
    const ok = await confirm({ message: t("confirmDeleteTag"), danger: true });
    if (!ok) return;
    await api.delete(`/tags/${id}`);
    await load();
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm({ message: t("confirmBulkDeleteTags"), danger: true });
    if (!ok) return;
    for (const id of ids) {
      // keep it sequential to avoid spamming the API and to preserve errors
      await api.delete(`/tags/${id}`);
    }
    await load();
  }

  function requestSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "used_count" ? "desc" : "asc");
  }

  const sortedItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = query ? items.filter((x) => x.name.toLowerCase().includes(query)) : items;
    const dir = sortDir === "asc" ? 1 : -1;
    return stableSort(base, (a, b) => {
      if (sortKey === "used_count") return (((a.used_count ?? 0) - (b.used_count ?? 0)) * dir);
      return a.name.localeCompare(b.name) * dir;
    });
  }, [items, q, sortDir, sortKey]);

  const pagedItems = useMemo(() => {
    const start = page * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, page, pageSize]);

  useEffect(() => {
    if (page === 0) return;
    if (page * pageSize >= sortedItems.length) setPage(0);
  }, [page, pageSize, sortedItems.length]);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Typography variant="h6">
            {t("tags")}
          </Typography>
          <Button variant="contained" onClick={openCreate}>
            {t("create")}
          </Button>
          {selectedIds.size > 0 ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">
                {t("selected")}: {selectedIds.size}
              </Typography>
              <Button size="small" color="error" onClick={bulkDelete}>
                {t("delete")}
              </Button>
            </Stack>
          ) : null}
          <Box sx={{ flexGrow: 1 }} />
          <TextField
            label={t("search")}
            placeholder={t("searchTagsHint")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            size="small"
            sx={{ width: 240 }}
          />
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={pagedItems.length > 0 && pagedItems.every((x) => selectedIds.has(x.id))}
                  indeterminate={
                    selectedIds.size > 0 &&
                    pagedItems.some((x) => selectedIds.has(x.id)) &&
                    !pagedItems.every((x) => selectedIds.has(x.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds((prev) => new Set([...Array.from(prev), ...pagedItems.map((x) => x.id)]));
                    } else {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        pagedItems.forEach((x) => next.delete(x.id));
                        return next;
                      });
                    }
                  }}
                />
              </TableCell>
              <TableCell sortDirection={sortKey === "name" ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === "name"}
                  direction={sortKey === "name" ? sortDir : "asc"}
                  onClick={() => requestSort("name")}
                >
                  {t("tags")}
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortKey === "used_count" ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === "used_count"}
                  direction={sortKey === "used_count" ? sortDir : "asc"}
                  onClick={() => requestSort("used_count")}
                >
                  {t("used")}
                </TableSortLabel>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedItems.map((x) => (
              <TableRow key={x.id}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.has(x.id)}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(x.id);
                        else next.delete(x.id);
                        return next;
                      });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    onClick={(e) => {
                      const base = me?.is_admin && !e.altKey ? "/admin/transactions" : "/transactions";
                      navigate(`${base}?tagId=${x.id}`);
                    }}
                  >
                    {x.name}
                  </Button>
                </TableCell>
                <TableCell>{x.used_count ?? 0}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(x)}>
                    {t("edit")}
                  </Button>
                  <Button size="small" color="error" onClick={() => del(x.id)}>
                    {t("delete")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={sortedItems.length}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(n) => {
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
            <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={save} variant="contained" disabled={saving}>
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </Stack>
  );
}
