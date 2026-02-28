import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  FormControlLabel,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableSortLabel,
  TableRow,
  Menu,
  MenuItem,
  TextField,
  Typography
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import { api } from "../api/client";
import dayjs from "../dayjs";
import { DateRangePresets } from "../components/DateRangePresets";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";
import { useConfirm } from "../hooks/useConfirm";
import { safeParseJson } from "../storage";
import { PaginationBar } from "../components/PaginationBar";

type Tx = {
  id: number;
  user_id: number;
  user?: { id: number; email: string; username: string } | null;
  type: "income" | "expense";
  amount: number;
  currency: string;
  occurred_at: string;
  note?: string | null;
  is_voided: boolean;
  categories: Category[];
  tags: Tag[];
  field_values?: { field_id: number; value: string }[];
};

type SortDir = "asc" | "desc";
type SortKey = "user" | "occurred_at" | "type" | "amount" | "currency" | "categories" | "tags" | "note";
const STORAGE_KEY = "pageState:adminTransactions";

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const r = cmp(a.v, b.v);
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.v);
}

type Category = { id: number; name: string };
type Tag = { id: number; name: string };
type User = { id: number; email: string; username: string };
type CategoryField = { id: number; category_id: number; name: string; is_required: boolean; created_at?: string };

export function AdminTransactionsPage() {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Tx[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const persisted = useMemo(() => safeParseJson<Record<string, any>>(STORAGE_KEY) || {}, []);
  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange(
    "dateRange:adminTransactions",
    30
  );
  const [voided, setVoided] = useState<boolean>(() => (typeof persisted.voided === "boolean" ? persisted.voided : false));
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "income">(() => {
    const v = persisted.typeFilter;
    return v === "expense" || v === "income" || v === "all" ? v : "all";
  });
  const [q, setQ] = useState<string>(() => (typeof persisted.q === "string" ? persisted.q : ""));
  const [minAmount, setMinAmount] = useState<string>(() => (typeof persisted.minAmount === "string" ? persisted.minAmount : ""));
  const [maxAmount, setMaxAmount] = useState<string>(() => (typeof persisted.maxAmount === "string" ? persisted.maxAmount : ""));
  const [linkUserId, setLinkUserId] = useState<number | null>(() => {
    const v = searchParams.get("userId");
    if (v && !Number.isNaN(Number(v))) return Number(v);
    const persistedId = persisted.linkUserId;
    return typeof persistedId === "number" && Number.isFinite(persistedId) ? persistedId : null;
  });
  const [linkCategoryId, setLinkCategoryId] = useState<number | null>(() => {
    const v = searchParams.get("categoryId");
    if (v && !Number.isNaN(Number(v))) return Number(v);
    const persistedId = persisted.linkCategoryId;
    return typeof persistedId === "number" && Number.isFinite(persistedId) ? persistedId : null;
  });
  const [linkTagId, setLinkTagId] = useState<number | null>(() => {
    const v = searchParams.get("tagId");
    if (v && !Number.isNaN(Number(v))) return Number(v);
    const persistedId = persisted.linkTagId;
    return typeof persistedId === "number" && Number.isFinite(persistedId) ? persistedId : null;
  });
  const [listCategoryFields, setListCategoryFields] = useState<CategoryField[]>([]);
  const [loadingListCategoryFields, setLoadingListCategoryFields] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [pageSize, setPageSize] = useState<number>(() => {
    const v = persisted.pageSize;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 20;
  });
  const [page, setPage] = useState<number>(() => {
    const v = persisted.page;
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  });
  const [appliedFilters, setAppliedFilters] = useState<Record<string, any> | null>(null);
  const [appliedFilterKey, setAppliedFilterKey] = useState<string>(() => {
    const v = persisted.appliedFilterKey;
    return typeof v === "string" ? v : "";
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actionsAnchorEl, setActionsAnchorEl] = useState<HTMLElement | null>(null);
  const [actionsTx, setActionsTx] = useState<Tx | null>(null);
  const [openBulkCategories, setOpenBulkCategories] = useState(false);
  const [bulkCategories, setBulkCategories] = useState<Category[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const v = persisted.sortKey;
    const keys: SortKey[] = ["user", "occurred_at", "type", "amount", "currency", "categories", "tags", "note"];
    return typeof v === "string" && keys.includes(v as SortKey) ? (v as SortKey) : "occurred_at";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => (persisted.sortDir === "asc" || persisted.sortDir === "desc" ? persisted.sortDir : "desc"));

  useEffect(() => {
    const payload = {
      voided,
      typeFilter,
      q,
      minAmount,
      maxAmount,
      linkUserId,
      linkCategoryId,
      linkTagId,
      sortKey,
      sortDir,
      page,
      pageSize,
      appliedFilterKey
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [voided, typeFilter, q, minAmount, maxAmount, linkUserId, linkCategoryId, linkTagId, sortKey, sortDir, page, pageSize, appliedFilterKey]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;

    if (linkUserId) {
      if (next.get("userId") !== String(linkUserId)) {
        next.set("userId", String(linkUserId));
        changed = true;
      }
    } else if (next.has("userId")) {
      next.delete("userId");
      changed = true;
    }

    if (linkCategoryId) {
      if (next.get("categoryId") !== String(linkCategoryId)) {
        next.set("categoryId", String(linkCategoryId));
        changed = true;
      }
    } else if (next.has("categoryId")) {
      next.delete("categoryId");
      changed = true;
    }

    if (linkTagId) {
      if (next.get("tagId") !== String(linkTagId)) {
        next.set("tagId", String(linkTagId));
        changed = true;
      }
    } else if (next.has("tagId")) {
      next.delete("tagId");
      changed = true;
    }

    if (changed) setSearchParams(next, { replace: true });
  }, [linkUserId, linkCategoryId, linkTagId, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!linkCategoryId) {
        setListCategoryFields([]);
        return;
      }
      setLoadingListCategoryFields(true);
      try {
        const res = await api.get(`/categories/${linkCategoryId}/fields`);
        if (cancelled) return;
        setListCategoryFields(((res.data || []) as CategoryField[]).filter((f) => f && typeof f.id === "number"));
      } finally {
        if (!cancelled) setLoadingListCategoryFields(false);
      }
    }
    run().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [linkCategoryId]);

  useEffect(() => {
    setLoadingMeta(true);
    Promise.all([api.get("/categories"), api.get("/tags"), api.get("/admin/users")])
      .then(([c, tg, u]) => {
        setCategories((c.data || []) as Category[]);
        setTags((tg.data || []) as Tag[]);
        setUsers((u.data || []) as User[]);
      })
      .catch(() => {})
      .finally(() => setLoadingMeta(false));
  }, []);

  const userLabelById = useMemo(() => {
    const map = new Map<number, string>();
    users.forEach((u) => map.set(u.id, `${u.username} (${u.email})`));
    return map;
  }, [users]);

  function buildFilterParams() {
    const p: Record<string, any> = {
      user_id: linkUserId ?? undefined,
      voided: voided ? true : undefined
    };
    if (preset !== "all") {
      p.start = start.format("YYYY-MM-DD");
      p.end = end.format("YYYY-MM-DD");
    }
    const query = q.trim();
    if (query) p.q = query;
    if (typeFilter !== "all") p.type = typeFilter;
    const min = minAmount.trim();
    const max = maxAmount.trim();
    if (min !== "" && !Number.isNaN(Number(min))) p.min_amount = Number(min);
    if (max !== "" && !Number.isNaN(Number(max))) p.max_amount = Number(max);
    if (linkCategoryId) p.category_id = linkCategoryId;
    if (linkTagId) p.tag_id = linkTagId;
    return p;
  }

  function applyFilters() {
    setSelectedIds(new Set());
    const next = buildFilterParams();
    const nextKey = JSON.stringify(next);
    if (appliedFilterKey && appliedFilterKey !== nextKey) setPage(0);
    setAppliedFilters(next);
    setAppliedFilterKey(nextKey);
  }

  function applyLinkedCategory(nextId: number) {
    setLinkCategoryId(nextId);
    const next = new URLSearchParams(searchParams);
    next.set("categoryId", String(nextId));
    setSearchParams(next);
    setSelectedIds(new Set());
    setPage(0);
    const p = buildFilterParams();
    p.category_id = nextId;
    const key = JSON.stringify(p);
    setAppliedFilters(p);
    setAppliedFilterKey(key);
  }

  function applyLinkedTag(nextId: number) {
    setLinkTagId(nextId);
    const next = new URLSearchParams(searchParams);
    next.set("tagId", String(nextId));
    setSearchParams(next);
    setSelectedIds(new Set());
    setPage(0);
    const p = buildFilterParams();
    p.tag_id = nextId;
    const key = JSON.stringify(p);
    setAppliedFilters(p);
    setAppliedFilterKey(key);
  }

  async function load(filters: Record<string, any>) {
    setLoadingList(true);
    const params = {
      ...filters,
      skip: page * pageSize,
      limit: pageSize,
      sort_key: sortKey,
      sort_dir: sortDir
    };
    try {
      const res = await api.get("/admin/transactions", { params });
      setItems((res.data.items || []) as Tx[]);
      setTotal(Number(res.data.total || 0));
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!appliedFilters) return;
    load(appliedFilters).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters, page, pageSize, sortKey, sortDir]);

  useEffect(() => {
    const filters = buildFilterParams();
    const key = JSON.stringify(filters);
    if (appliedFilterKey && appliedFilterKey !== key) setPage(0);
    setAppliedFilters(filters);
    setAppliedFilterKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "occurred_at" || nextKey === "amount" ? "desc" : "asc");
  }

  const sortedItems = useMemo(() => {
    if (sortKey !== "categories" && sortKey !== "tags") return items;
    const dir = sortDir === "asc" ? 1 : -1;
    return stableSort(items, (a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "categories":
          va = (a.categories || []).map((c) => c.name).join(", ");
          vb = (b.categories || []).map((c) => c.name).join(", ");
          break;
        case "tags":
          va = (a.tags || []).map((x) => x.name).join(", ");
          vb = (b.tags || []).map((x) => x.name).join(", ");
          break;
      }
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [items, sortDir, sortKey]);

  const tableMinWidth = useMemo(() => 1500 + listCategoryFields.length * 160, [listCategoryFields.length]);

  function openActionsMenu(e: React.MouseEvent<HTMLElement>, tx: Tx) {
    setActionsAnchorEl(e.currentTarget);
    setActionsTx(tx);
  }

  function closeActionsMenu() {
    setActionsAnchorEl(null);
    setActionsTx(null);
  }

  async function del(txId: number) {
    const ok = await confirm({ message: t("confirmDeleteTx"), danger: true });
    if (!ok) return;
    await api.delete(`/admin/transactions/${txId}`);
    if (appliedFilters) await load(appliedFilters);
  }

  async function toggleVoided(tx: Tx) {
    const ok = await confirm({
      message: tx.is_voided ? t("confirmRestoreTx") : t("confirmVoidTx"),
      danger: !tx.is_voided
    });
    if (!ok) return;
    await api.patch(`/admin/transactions/${tx.id}`, { is_voided: !tx.is_voided });
    if (appliedFilters) await load(appliedFilters);
  }

  async function bulk(action: "void" | "restore" | "delete") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm({
      message:
        action === "delete"
          ? t("confirmBulkDelete")
          : action === "void"
            ? t("confirmBulkVoid")
            : t("confirmBulkRestore"),
      danger: action !== "restore"
    });
    if (!ok) return;
    await api.post("/admin/transactions/bulk", { ids, action });
    setSelectedIds(new Set());
    if (appliedFilters) await load(appliedFilters);
  }

  async function bulkSetCategories() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (bulkSaving) return;
    const ok = await confirm({ message: t("confirmBulkSetCategories"), danger: false });
    if (!ok) return;
    setBulkSaving(true);
    try {
      await api.post("/admin/transactions/bulk", {
        ids,
        action: "set_categories",
        category_ids: bulkCategories.map((c) => c.id)
      });
      setOpenBulkCategories(false);
      setBulkCategories([]);
      setSelectedIds(new Set());
      if (appliedFilters) await load(appliedFilters);
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        {loadingMeta ? <LinearProgress sx={{ mb: 2 }} /> : null}
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <DateRangePresets
              value={preset}
              onChange={setPreset}
              setStart={(d) => setStart(d)}
              setEnd={(d) => setEnd(d)}
            />
            <DatePicker
              label={t("startDate")}
              value={start}
              disabled={preset === "all"}
              onChange={(v) => {
                if (!v) return;
                setPreset("custom");
                setStart(v);
              }}
            />
            <DatePicker
              label={t("endDate")}
              value={end}
              disabled={preset === "all"}
              onChange={(v) => {
                if (!v) return;
                setPreset("custom");
                setEnd(v);
              }}
            />
            <FormControlLabel
              control={<Checkbox checked={voided} onChange={(e) => setVoided(e.target.checked)} />}
              label={t("voided")}
            />
            <TextField
              label={t("search")}
              placeholder={t("searchNoteOnly")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              size="small"
              sx={{ width: 220 }}
            />
            <TextField
              select
              label={t("type")}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              size="small"
              sx={{ width: 160 }}
            >
              <MenuItem value="all">{t("all")}</MenuItem>
              <MenuItem value="expense">{t("expense")}</MenuItem>
              <MenuItem value="income">{t("income")}</MenuItem>
            </TextField>
            {linkUserId ? (
              <Chip
                color="info"
                variant="outlined"
                label={`${t("user")}: ${userLabelById.get(linkUserId) ?? `#${linkUserId}`}`}
                onDelete={() => {
                  setLinkUserId(null);
                  const next = new URLSearchParams(searchParams);
                  next.delete("userId");
                  setSearchParams(next);
                }}
              />
            ) : null}
            {linkCategoryId ? (
              <Chip
                color="primary"
                variant="outlined"
              label={`${t("linkedCategory")}: ${
                categories.find((c) => c.id === linkCategoryId)?.name ?? `#${linkCategoryId}`
              }`}
              onDelete={() => {
                setLinkCategoryId(null);
                const next = new URLSearchParams(searchParams);
                next.delete("categoryId");
                setSearchParams(next);
              }}
            />
          ) : null}
          {linkTagId ? (
            <Chip
              color="secondary"
              variant="outlined"
              label={`${t("linkedTag")}: ${tags.find((x) => x.id === linkTagId)?.name ?? `#${linkTagId}`}`}
              onDelete={() => {
                setLinkTagId(null);
                const next = new URLSearchParams(searchParams);
                next.delete("tagId");
                setSearchParams(next);
              }}
            />
          ) : null}
          <TextField
            label={t("minAmount")}
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            size="small"
            sx={{ width: 140 }}
          />
          <TextField
            label={t("maxAmount")}
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            size="small"
            sx={{ width: 140 }}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" type="submit">
            {t("apply")}
          </Button>
          </Stack>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        {loadingList || loadingListCategoryFields ? <LinearProgress sx={{ mb: 1 }} /> : null}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t("adminTransactions")} ({total})
          </Typography>
          {selectedIds.size > 0 ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">
                {t("selected")}: {selectedIds.size}
              </Typography>
              <Button
                size="small"
                onClick={() => {
                  setBulkCategories([]);
                  setOpenBulkCategories(true);
                }}
              >
                {t("bulkSetCategories")}
              </Button>
              <Button size="small" onClick={() => bulk("void")}>
                {t("void")}
              </Button>
              <Button size="small" onClick={() => bulk("restore")}>
                {t("restore")}
              </Button>
              <Button size="small" color="error" onClick={() => bulk("delete")}>
                {t("delete")}
              </Button>
            </Stack>
          ) : null}
          <Box sx={{ flexGrow: 1 }} />
        </Stack>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ tableLayout: "fixed", minWidth: tableMinWidth }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={items.length > 0 && items.every((x) => selectedIds.has(x.id))}
                    indeterminate={
                      selectedIds.size > 0 &&
                      items.some((x) => selectedIds.has(x.id)) &&
                      !items.every((x) => selectedIds.has(x.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(items.map((x) => x.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </TableCell>
                <TableCell sx={{ width: 300 }} sortDirection={sortKey === "user" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "user"}
                    direction={sortKey === "user" ? sortDir : "asc"}
                    onClick={() => requestSort("user")}
                  >
                    {t("user")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 110 }} sortDirection={sortKey === "occurred_at" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "occurred_at"}
                    direction={sortKey === "occurred_at" ? sortDir : "asc"}
                    onClick={() => requestSort("occurred_at")}
                  >
                    {t("occurredAt")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 80 }} sortDirection={sortKey === "type" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "type"}
                    direction={sortKey === "type" ? sortDir : "asc"}
                    onClick={() => requestSort("type")}
                  >
                    {t("type")}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ width: 100 }} sortDirection={sortKey === "amount" ? sortDir : false}>
                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <TableSortLabel
                      active={sortKey === "amount"}
                      direction={sortKey === "amount" ? sortDir : "asc"}
                      onClick={() => requestSort("amount")}
                    >
                      {t("amount")}
                    </TableSortLabel>
                  </Box>
                </TableCell>
                <TableCell sx={{ width: 80 }} sortDirection={sortKey === "currency" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "currency"}
                    direction={sortKey === "currency" ? sortDir : "asc"}
                    onClick={() => requestSort("currency")}
                  >
                    {t("currency")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 150 }} sortDirection={sortKey === "categories" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "categories"}
                    direction={sortKey === "categories" ? sortDir : "asc"}
                    onClick={() => requestSort("categories")}
                  >
                    {t("categories")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 400 }} sortDirection={sortKey === "tags" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "tags"}
                    direction={sortKey === "tags" ? sortDir : "asc"}
                    onClick={() => requestSort("tags")}
                  >
                    {t("tags")}
                  </TableSortLabel>
                </TableCell>
                {linkCategoryId
                  ? listCategoryFields.map((f) => (
                      <TableCell key={`field-${f.id}`} sx={{ width: 160 }}>
                        {f.name}
                      </TableCell>
                    ))
                  : null}
                <TableCell sx={{ width: 400 }} sortDirection={sortKey === "note" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "note"}
                    direction={sortKey === "note" ? sortDir : "asc"}
                    onClick={() => requestSort("note")}
                  >
                    {t("note")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{width: 120}}>{t("actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.map((it) => {
                const fvById = new Map<number, string>();
                (it.field_values || []).forEach((fv) => {
                  if (fv && typeof fv.field_id === "number" && typeof fv.value === "string") fvById.set(fv.field_id, fv.value);
                });
                return (
                <TableRow key={it.id}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedIds.has(it.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(it.id);
                          else next.delete(it.id);
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {it.user
                      ? `${it.user.username} (${it.user.email})`
                      : userLabelById.get(it.user_id) ?? `#${it.user_id}`}
                  </TableCell>
                  <TableCell>{dayjs(it.occurred_at).format("YYYY-MM-DD")}</TableCell>
                  <TableCell>
                    <Typography
                      component="span"
                      sx={{ color: it.type === "income" ? "#2e7d32" : "#d32f2f", fontSize: "13px" }}
                    >
                      {it.type === "income" ? t("income") : t("expense")}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{it.amount.toFixed(2)}</TableCell>
                  <TableCell align="left">{it.currency}</TableCell>
                  <TableCell>
                    {(it.categories || []).map((c) => (
                      <Chip
                        key={c.id}
                        label={c.name}
                        size="small"
                        clickable
                        onClick={() => applyLinkedCategory(c.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </TableCell>
                  <TableCell>
                    {(it.tags || []).map((x) => (
                      <Chip
                        key={x.id}
                        label={x.name}
                        size="small"
                        clickable
                        onClick={() => applyLinkedTag(x.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </TableCell>
                  {linkCategoryId
                    ? listCategoryFields.map((f) => (
                        <TableCell
                          key={`fv-${it.id}-${f.id}`}
                          sx={{ maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                          {fvById.get(f.id) || ""}
                        </TableCell>
                      ))
                    : null}
                  <TableCell sx={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.note || ""}
                  </TableCell>
                  <TableCell align="left">
                    <ButtonGroup variant="outlined" size="small">
                      <Button onClick={() => toggleVoided(it)}>{it.is_voided ? t("restore") : t("void")}</Button>
                      <Button onClick={(e) => openActionsMenu(e, it)} sx={{ px: 0.5, minWidth: 36 }}>
                        <ArrowDropDownIcon fontSize="small" />
                      </Button>
                    </ButtonGroup>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(n) => {
            setPage(0);
            setPageSize(n);
          }}
        />
      </Paper>

      <Dialog
        open={openBulkCategories}
        onClose={() => {
          if (bulkSaving) return;
          setOpenBulkCategories(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t("bulkSetCategories")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Autocomplete
              multiple
              options={categories}
              getOptionLabel={(o) => o.name}
              value={bulkCategories}
              onChange={(_, v) => setBulkCategories(v)}
              renderInput={(params) => <TextField {...params} label={t("categories")} />}
            />
            <Typography variant="body2" color="text.secondary">
              {t("bulkSetCategoriesHint")}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (bulkSaving) return;
              setOpenBulkCategories(false);
            }}
          >
            {t("cancel")}
          </Button>
          <Button onClick={bulkSetCategories} variant="contained" disabled={bulkSaving}>
            {t("apply")}
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={actionsAnchorEl}
        open={!!actionsAnchorEl}
        onClose={closeActionsMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Divider />
        <MenuItem
          onClick={() => {
            if (!actionsTx) return;
            const id = actionsTx.id;
            closeActionsMenu();
            del(id);
          }}
        >
          {t("delete")}
        </MenuItem>
      </Menu>
      {dialog}
    </Stack>
  );
}
