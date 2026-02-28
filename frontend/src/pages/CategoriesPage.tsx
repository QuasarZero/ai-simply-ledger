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

type Category = { id: number; name: string; description?: string | null };
type SortDir = "asc" | "desc";
type SortKey = "name" | "description";
const STORAGE_KEY = "pageState:categories";

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const r = cmp(a.v, b.v);
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.v);
}

export function CategoriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const { me } = useAuth();
  const [items, setItems] = useState<Category[]>([]);
  const persisted = useMemo(() => safeParseJson<Record<string, any>>(STORAGE_KEY) || {}, []);
  const [q, setQ] = useState<string>(() => (typeof persisted.q === "string" ? persisted.q : ""));
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const v = persisted.sortKey;
    return v === "name" || v === "description" ? v : "name";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => (persisted.sortDir === "asc" || persisted.sortDir === "desc" ? persisted.sortDir : "asc"));
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
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await api.get("/categories");
    setItems(res.data as Category[]);
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
    setDescription("");
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setDescription(c.description || "");
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/categories/${editing.id}`, { name, description: description || null });
      } else {
        await api.post("/categories", { name, description: description || null });
      }
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number) {
    const ok = await confirm({ message: t("confirmDeleteCategory"), danger: true });
    if (!ok) return;
    await api.delete(`/categories/${id}`);
    await load();
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm({ message: t("confirmBulkDeleteCategories"), danger: true });
    if (!ok) return;
    for (const id of ids) {
      await api.delete(`/categories/${id}`);
    }
    await load();
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
      ? items.filter((c) => {
          const nameHit = c.name.toLowerCase().includes(query);
          const descHit = (c.description || "").toLowerCase().includes(query);
          return nameHit || descHit;
        })
      : items;
    const dir = sortDir === "asc" ? 1 : -1;
    return stableSort(base, (a, b) => {
      const va = sortKey === "name" ? a.name : (a.description || "");
      const vb = sortKey === "name" ? b.name : (b.description || "");
      return String(va).localeCompare(String(vb)) * dir;
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
            {t("categories")} ({sortedItems.length})
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
            placeholder={t("searchCategoriesHint")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            size="small"
            sx={{ width: 260 }}
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
                  {t("categories")}
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={sortKey === "description" ? sortDir : false}>
                <TableSortLabel
                  active={sortKey === "description"}
                  direction={sortKey === "description" ? sortDir : "asc"}
                  onClick={() => requestSort("description")}
                >
                  {t("note")}
                </TableSortLabel>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedItems.map((c) => (
              <TableRow key={c.id}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.has(c.id)}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    onClick={(e) => {
                      const base =
                        me?.is_admin && !e.altKey ? "/admin/transactions" : "/transactions";
                      navigate(`${base}?categoryId=${c.id}`);
                    }}
                  >
                    {c.name}
                  </Button>
                </TableCell>
                <TableCell>{c.description || ""}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(c)}>
                    {t("edit")}
                  </Button>
                  <Button size="small" color="error" onClick={() => del(c.id)}>
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
            <TextField label={t("note")} value={description} onChange={(e) => setDescription(e.target.value)} />
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
