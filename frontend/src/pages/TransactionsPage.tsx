import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Checkbox,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableSortLabel,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import { api } from "../api/client";
import dayjs from "../dayjs";
import { DateRangePresets } from "../components/DateRangePresets";
import { YearMonthCalendarHeader } from "../components/YearMonthCalendarHeader";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";
import { useConfirm } from "../hooks/useConfirm";
import { useSearchParams } from "react-router-dom";
import { safeParseJson } from "../storage";
import { PaginationBar } from "../components/PaginationBar";

type Category = { id: number; name: string; description?: string | null };
type Tag = { id: number; name: string; used_count?: number };
type CategoryField = { id: number; category_id: number; name: string; is_required: boolean; created_at?: string };
type Currency = { code: string; name: string };

type Tx = {
  id: number;
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
type SortKey = "id" | "occurred_at" | "type" | "amount" | "currency" | "categories" | "tags" | "note" | `field:${number}`;

function isFieldSortKey(v: unknown): v is `field:${number}` {
  return typeof v === "string" && /^field:\d+$/.test(v);
}

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const r = cmp(a.v, b.v);
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.v);
}

const tagFilter = createFilterOptions<TagOption>();
const STORAGE_KEY = "pageState:transactions";

type TagOption =
  | Tag
  | {
      inputValue: string;
      name: string;
    }
  | string;

export function TransactionsPage() {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Tx[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const persisted = useMemo(() => safeParseJson<Record<string, any>>(STORAGE_KEY) || {}, []);

  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange(
    "dateRange:transactions",
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
    const keys: Array<Exclude<SortKey, `field:${number}`>> = ["id", "occurred_at", "type", "amount", "currency", "categories", "tags", "note"];
    if (typeof v === "string" && keys.includes(v as any)) return v as SortKey;
    if (isFieldSortKey(v)) return v;
    return "occurred_at";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => (persisted.sortDir === "asc" || persisted.sortDir === "desc" ? persisted.sortDir : "desc"));

  useEffect(() => {
    const payload = {
      voided,
      typeFilter,
      q,
      minAmount,
      maxAmount,
      linkCategoryId,
      linkTagId,
      sortKey,
      sortDir,
      page,
      pageSize,
      appliedFilterKey
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [voided, typeFilter, q, minAmount, maxAmount, linkCategoryId, linkTagId, sortKey, sortDir, page, pageSize, appliedFilterKey]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;

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
  }, [linkCategoryId, linkTagId, searchParams, setSearchParams]);

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
    if (!isFieldSortKey(sortKey)) return;
    const exists = listCategoryFields.some((f) => sortKey === `field:${f.id}`);
    if (!exists) setSortKey("occurred_at");
  }, [listCategoryFields, sortKey]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("CNY");
  const [occurredAt, setOccurredAt] = useState<Dayjs>(dayjs());
  const [note, setNote] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [categoryFields, setCategoryFields] = useState<CategoryField[]>([]);
  const [fieldValueMap, setFieldValueMap] = useState<Record<number, string>>({});
  const [fieldValueOptions, setFieldValueOptions] = useState<Record<number, string[]>>({});
  const fieldValueTimers = React.useRef<Record<number, any>>({});

  const currencyCodes = useMemo(() => {
    const base = (currencies || []).map((c) => c.code);
    const current = (currency || "").toUpperCase();
    const out = current && !base.includes(current) ? [...base, current] : base;
    return out.length ? out : ["CNY", "USD", "EUR", "JPY", "HKD", "GBP"];
  }, [currencies, currency]);

  async function loadMeta() {
    setLoadingMeta(true);
    try {
      const [cRes, tRes, curRes] = await Promise.all([
        api.get("/categories"),
        api.get("/tags"),
        api.get("/currencies")
      ]);
      setCategories(cRes.data as Category[]);
      setTags(tRes.data as Tag[]);
      setCurrencies((curRes.data || []) as Currency[]);
    } finally {
      setLoadingMeta(false);
    }
  }

  function buildFilterParams() {
    const p: Record<string, any> = {
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
      const res = await api.get("/transactions", { params });
      setItems((res.data.items || []) as Tx[]);
      setTotal(Number(res.data.total || 0));
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadMeta().catch(() => {});
  }, []);

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
    setSortDir(nextKey === "occurred_at" || nextKey === "amount" || nextKey === "id" ? "desc" : "asc");
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

  const tableMinWidth = useMemo(() => 1200 + listCategoryFields.length * 160, [listCategoryFields.length]);

  function openActionsMenu(e: React.MouseEvent<HTMLElement>, tx: Tx) {
    setActionsAnchorEl(e.currentTarget);
    setActionsTx(tx);
  }

  function closeActionsMenu() {
    setActionsAnchorEl(null);
    setActionsTx(null);
  }

  function copyTx(it: Tx) {
    setEditing(null);
    setIsCopying(true);
    setType(it.type);
    setAmount(it.amount);
    setCurrency(it.currency);
    setOccurredAt(dayjs());
    setNote(it.note || "");
    setSelectedCategories(it.categories || []);
    setSelectedTags(it.tags || []);
    const map: Record<number, string> = {};
    (it.field_values || []).forEach((fv) => {
      if (fv && typeof fv.field_id === "number" && typeof fv.value === "string") map[fv.field_id] = fv.value;
    });
    setFieldValueMap(map);
    setOpen(true);
  }

  function resetForm() {
    setEditing(null);
    setIsCopying(false);
    setType("expense");
    setAmount(0);
    setCurrency("CNY");
    setOccurredAt(dayjs());
    setNote("");
    setSelectedCategories([]);
    setSelectedTags([]);
    setCategoryFields([]);
    setFieldValueMap({});
    setFieldValueOptions({});
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(tx: Tx) {
    setEditing(tx);
    setIsCopying(false);
    setType(tx.type);
    setAmount(tx.amount);
    setCurrency(tx.currency);
    setOccurredAt(dayjs(tx.occurred_at));
    setNote(tx.note || "");
    setSelectedCategories(tx.categories || []);
    setSelectedTags(tx.tags || []);
    const map: Record<number, string> = {};
    (tx.field_values || []).forEach((fv) => {
      if (fv && typeof fv.field_id === "number" && typeof fv.value === "string") map[fv.field_id] = fv.value;
    });
    setFieldValueMap(map);
    setOpen(true);
  }

  async function loadFieldsForCategories(categoryIds: number[]) {
    if (categoryIds.length === 0) {
      setCategoryFields([]);
      return;
    }
    const res = await Promise.all(categoryIds.map((id) => api.get(`/categories/${id}/fields`)));
    const merged = res.flatMap((r) => (r.data || []) as CategoryField[]);
    const byId = new Map<number, CategoryField>();
    merged.forEach((f) => {
      if (f && typeof f.id === "number") byId.set(f.id, f);
    });
    setCategoryFields(Array.from(byId.values()));
  }

  useEffect(() => {
    if (!open) return;
    const ids = (selectedCategories || []).map((c) => c.id);
    loadFieldsForCategories(ids).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedCategories.map((c) => c.id).join(",")]);

  useEffect(() => {
    const allowed = new Set(categoryFields.map((f) => f.id));
    setFieldValueMap((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const id = Number(k);
        if (allowed.has(id) && String(v || "").trim() !== "") next[id] = String(v);
      });
      return next;
    });
  }, [categoryFields]);

  async function fetchFieldValueOptions(fieldId: number, query: string) {
    const res = await api.get(`/category-fields/${fieldId}/values`, { params: { q: query || undefined } });
    setFieldValueOptions((prev) => ({ ...prev, [fieldId]: (res.data || []) as string[] }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const payload = {
      type,
      amount,
      currency,
      occurred_at: occurredAt.toISOString(),
      note: note || null,
      category_ids: selectedCategories.map((c) => c.id),
      tag_ids: selectedTags.map((x) => x.id),
      field_values: Object.entries(fieldValueMap)
        .map(([field_id, value]) => ({ field_id: Number(field_id), value }))
        .filter((x) => x.field_id > 0 && String(x.value || "").trim() !== "")
    };
    try {
      if (editing) {
        await api.patch(`/transactions/${editing.id}`, payload);
      } else {
        await api.post("/transactions", payload);
      }
      setOpen(false);
      resetForm();
      const filters = appliedFilters || buildFilterParams();
      const key = JSON.stringify(filters);
      setAppliedFilters(filters);
      setAppliedFilterKey(key);
      await load(filters);
    } finally {
      setSaving(false);
    }
  }

  async function del(txId: number) {
    const ok = await confirm({ message: t("confirmDeleteTx"), danger: true });
    if (!ok) return;
    await api.delete(`/transactions/${txId}`);
    if (appliedFilters) await load(appliedFilters);
  }

  async function toggleVoided(tx: Tx) {
    const ok = await confirm({
      message: tx.is_voided ? t("confirmRestoreTx") : t("confirmVoidTx"),
      danger: !tx.is_voided
    });
    if (!ok) return;
    await api.patch(`/transactions/${tx.id}`, { is_voided: !tx.is_voided });
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
    await api.post("/transactions/bulk", { ids, action });
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
      await api.post("/transactions/bulk", {
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

  async function ensureTagByName(name: string): Promise<Tag> {
    const trimmed = name.trim();
    const existing = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    try {
      const res = await api.post("/tags", { name: trimmed });
      const created = res.data as Tag;
      setTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return created;
    } catch (err: any) {
      if (err?.response?.status === 400) {
        const refreshed = (await api.get("/tags")).data as Tag[];
        setTags(refreshed);
        const found = refreshed.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
        if (found) return found;
      }
      throw err;
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
          onKeyDownCapture={(e) => {
            if (e.key !== "Enter") return;
            // Only allow Ctrl/Cmd+Enter to apply filters.
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) applyFilters();
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
              views={["year", "month", "day"]}
              format="YYYY-MM-DD"
              onChange={(v) => {
                if (!v) return;
                setPreset("custom");
                setStart(v);
              }}
              slots={{ calendarHeader: YearMonthCalendarHeader }}
              slotProps={{
                textField: { size: "small" },
                actionBar: { actions: ["today"] }
              }}
            />
            <DatePicker
              label={t("endDate")}
              value={end}
              disabled={preset === "all"}
              views={["year", "month", "day"]}
              format="YYYY-MM-DD"
              onChange={(v) => {
                if (!v) return;
                setPreset("custom");
                setEnd(v);
              }}
              slots={{ calendarHeader: YearMonthCalendarHeader }}
              slotProps={{
                textField: { size: "small" },
                actionBar: { actions: ["today"] }
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
        </Stack>
        <Button 
          variant="outlined" 
          type="submit" 
          fullWidth 
          sx={{ mt: 2 }}
        >
          {t("apply")}
        </Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        {loadingList || loadingListCategoryFields ? <LinearProgress sx={{ mb: 1 }} /> : null}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <Typography variant="h6">
            {t("transactions")} ({total})
          </Typography>
          <Button variant="contained" onClick={openCreate}>
            {t("create")}
          </Button>
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
                <TableCell sx={{ width: 80 }} sortDirection={sortKey === "id" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "id"}
                    direction={sortKey === "id" ? sortDir : "asc"}
                    onClick={() => requestSort("id")}
                  >
                    {t("id")}
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
                <TableCell sx={{ width: 90 }} sortDirection={sortKey === "type" ? sortDir : false}>
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
                <TableCell sx={{ width: 90 }} sortDirection={sortKey === "currency" ? sortDir : false}>
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
                  ? listCategoryFields.map((f) => {
                      const key: SortKey = `field:${f.id}`;
                      return (
                        <TableCell
                          key={`field-${f.id}`}
                          sx={{ width: 160 }}
                          sortDirection={sortKey === key ? sortDir : false}
                        >
                          <TableSortLabel
                            active={sortKey === key}
                            direction={sortKey === key ? sortDir : "asc"}
                            onClick={() => requestSort(key)}
                          >
                            {f.name}
                          </TableSortLabel>
                        </TableCell>
                      );
                    })
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
                  <TableCell>{it.id}</TableCell>
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
                    {it.categories.map((c) => (
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
                    {it.tags.map((x) => (
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
                  <TableCell sx={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.note || ""}
                  </TableCell>
                  <TableCell align="left">
                    <ButtonGroup variant="outlined" size="small">
                      <Button onClick={() => openEdit(it)}>{t("edit")}</Button>
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

      <Menu
        anchorEl={actionsAnchorEl}
        open={!!actionsAnchorEl}
        onClose={closeActionsMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            if (!actionsTx) return;
            copyTx(actionsTx);
            closeActionsMenu();
          }}
        >
          {t("copy")}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (!actionsTx) return;
            const tx = actionsTx;
            closeActionsMenu();
            toggleVoided(tx);
          }}
        >
          {actionsTx?.is_voided ? t("restore") : t("void")}
        </MenuItem>
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
        <DialogTitle>{isCopying ? t("copy") : editing ? t("edit") : t("create")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label={t("type")}
              value={type}
              onChange={(e) => setType(e.target.value as any)}
            >
              <MenuItem value="expense">{t("expense")}</MenuItem>
              <MenuItem value="income">{t("income")}</MenuItem>
            </TextField>
            <TextField
              label={t("amount")}
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <TextField
              select
              label={t("currency")}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencyCodes.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <DatePicker
              label={t("occurredAt")}
              value={occurredAt}
              views={["year", "month", "day"]}
              format="YYYY-MM-DD"
              onChange={(v) => v && setOccurredAt(v)}
              slots={{ calendarHeader: YearMonthCalendarHeader }}
              slotProps={{
                textField: { size: "small" },
                actionBar: { actions: ["today"] }
              }}
            />
            <Autocomplete
              multiple
              options={categories}
              getOptionLabel={(o) => o.name}
              value={selectedCategories}
              onChange={(_, v) => setSelectedCategories(v)}
              renderInput={(params) => <TextField {...params} label={t("categories")} />}
            />
            <Autocomplete
              multiple
              freeSolo
              selectOnFocus
              clearOnBlur
              handleHomeEndKeys
              options={tags as TagOption[]}
              filterOptions={(options, params) => {
                const filtered = tagFilter(options as any, params);
                const inputValue = params.inputValue.trim();
                const exists = tags.some((t) => t.name.toLowerCase() === inputValue.toLowerCase());
                if (inputValue !== "" && !exists) {
                  filtered.push({
                    inputValue,
                    name: `+ ${t("create")}: "${inputValue}"`
                  } as any);
                }
                return filtered as any;
              }}
              getOptionLabel={(o) => {
                if (typeof o === "string") return o;
                if ((o as any).inputValue) return (o as any).name;
                return (o as Tag).name;
              }}
              value={selectedTags}
              onChange={async (_, v) => {
                const next: Tag[] = [];
                for (const item of v as TagOption[]) {
                  if (typeof item === "string") {
                    next.push(await ensureTagByName(item));
                  } else if ((item as any).inputValue) {
                    next.push(await ensureTagByName((item as any).inputValue));
                  } else {
                    next.push(item as Tag);
                  }
                }
                const dedup = Array.from(new Map(next.map((x) => [x.id, x])).values());
                setSelectedTags(dedup);
              }}
              renderInput={(params) => <TextField {...params} label={t("tags")} helperText={t("createTagHint")} />}
            />
            <TextField
              label={t("note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              multiline
              minRows={3}
              maxRows={12}
              sx={{ "& textarea": { resize: "vertical" } }}
            />

            {categoryFields.length > 0 ? (
              <>
                <Divider />
                <Typography variant="subtitle2">{t("fields")}</Typography>
                {categoryFields.map((f) => (
                  <Autocomplete
                    key={f.id}
                    freeSolo
                    options={fieldValueOptions[f.id] || []}
                    value={fieldValueMap[f.id] || ""}
                    inputValue={fieldValueMap[f.id] || ""}
                    onOpen={() => {
                      if ((fieldValueOptions[f.id] || []).length === 0) {
                        fetchFieldValueOptions(f.id, "").catch(() => {});
                      }
                    }}
                    onInputChange={(_, v) => {
                      setFieldValueMap((prev) => ({ ...prev, [f.id]: v }));
                      if (fieldValueTimers.current[f.id]) clearTimeout(fieldValueTimers.current[f.id]);
                      fieldValueTimers.current[f.id] = setTimeout(() => {
                        fetchFieldValueOptions(f.id, v).catch(() => {});
                      }, 250);
                    }}
                    onChange={(_, v) => {
                      const next = typeof v === "string" ? v : String(v || "");
                      setFieldValueMap((prev) => ({ ...prev, [f.id]: next }));
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={f.name}
                        required={!!f.is_required}
                        helperText={f.is_required ? t("required") : undefined}
                      />
                    )}
                  />
                ))}
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={save} variant="contained" disabled={saving}>
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>

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
      {dialog}
    </Stack>
  );
}
