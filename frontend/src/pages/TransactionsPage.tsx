import React, { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import dayjs from "../dayjs";
import { DateRangePresets } from "../components/DateRangePresets";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";
import { useConfirm } from "../hooks/useConfirm";
import { useSearchParams } from "react-router-dom";

type Category = { id: number; name: string; description?: string | null };
type Tag = { id: number; name: string; used_count?: number };

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
};

const currencies = ["CNY", "USD", "EUR", "JPY", "HKD", "GBP"];
const tagFilter = createFilterOptions<TagOption>();

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange(
    "dateRange:transactions",
    30
  );
  const [voided, setVoided] = useState(false);
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [linkCategoryId, setLinkCategoryId] = useState<number | null>(() => {
    const v = searchParams.get("categoryId");
    return v && !Number.isNaN(Number(v)) ? Number(v) : null;
  });
  const [linkTagId, setLinkTagId] = useState<number | null>(() => {
    const v = searchParams.get("tagId");
    return v && !Number.isNaN(Number(v)) ? Number(v) : null;
  });
  const [appliedParams, setAppliedParams] = useState<Record<string, any> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const key = "filter:transactions:voided";
    const saved = localStorage.getItem(key);
    if (saved === "true") setVoided(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("filter:transactions:voided", voided ? "true" : "false");
  }, [voided]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("CNY");
  const [occurredAt, setOccurredAt] = useState<Dayjs>(dayjs());
  const [note, setNote] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  async function loadMeta() {
    const [cRes, tRes] = await Promise.all([api.get("/categories"), api.get("/tags")]);
    setCategories(cRes.data as Category[]);
    setTags(tRes.data as Tag[]);
  }

  function buildParams() {
    const p: Record<string, any> = {
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      voided: voided ? true : undefined
    };
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
    setAppliedParams(buildParams());
  }

  async function load(params: Record<string, any>) {
    const res = await api.get("/transactions", { params });
    setItems((res.data.items || []) as Tx[]);
  }

  useEffect(() => {
    loadMeta().catch(() => {});
  }, []);

  useEffect(() => {
    if (!appliedParams) return;
    load(appliedParams).catch(() => {});
  }, [appliedParams]);

  useEffect(() => {
    setAppliedParams(buildParams());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditing(null);
    setType("expense");
    setAmount(0);
    setCurrency("CNY");
    setOccurredAt(dayjs());
    setNote("");
    setSelectedCategories([]);
    setSelectedTags([]);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(tx: Tx) {
    setEditing(tx);
    setType(tx.type);
    setAmount(tx.amount);
    setCurrency(tx.currency);
    setOccurredAt(dayjs(tx.occurred_at));
    setNote(tx.note || "");
    setSelectedCategories(tx.categories || []);
    setSelectedTags(tx.tags || []);
    setOpen(true);
  }

  async function save() {
    const payload = {
      type,
      amount,
      currency,
      occurred_at: occurredAt.toISOString(),
      note: note || null,
      category_ids: selectedCategories.map((c) => c.id),
      tag_ids: selectedTags.map((x) => x.id)
    };
    if (editing) {
      await api.patch(`/transactions/${editing.id}`, payload);
    } else {
      await api.post("/transactions", payload);
    }
    setOpen(false);
    resetForm();
    const p = appliedParams || buildParams();
    await load(p);
    setAppliedParams(p);
  }

  async function del(txId: number) {
    const ok = await confirm({ message: t("confirmDeleteTx"), danger: true });
    if (!ok) return;
    await api.delete(`/transactions/${txId}`);
    if (appliedParams) await load(appliedParams);
  }

  async function toggleVoided(tx: Tx) {
    const ok = await confirm({
      message: tx.is_voided ? t("confirmRestoreTx") : t("confirmVoidTx"),
      danger: !tx.is_voided
    });
    if (!ok) return;
    await api.patch(`/transactions/${tx.id}`, { is_voided: !tx.is_voided });
    if (appliedParams) await load(appliedParams);
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
    if (appliedParams) await load(appliedParams);
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
              onChange={(v) => {
                if (!v) return;
                setPreset("custom");
                setStart(v);
              }}
            />
            <DatePicker
              label={t("endDate")}
              value={end}
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
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t("transactions")}
          </Typography>
          {selectedIds.size > 0 ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">
                {t("selected")}: {selectedIds.size}
              </Typography>
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
          <Button variant="contained" onClick={openCreate}>
            {t("create")}
          </Button>
        </Stack>
        <Table size="small">
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
              <TableCell>{t("occurredAt")}</TableCell>
              <TableCell>{t("type")}</TableCell>
              <TableCell>{t("amount")}</TableCell>
              <TableCell>{t("currency")}</TableCell>
              <TableCell>{t("categories")}</TableCell>
              <TableCell>{t("tags")}</TableCell>
              <TableCell>{t("note")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it) => (
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
                <TableCell>{dayjs(it.occurred_at).format("YYYY-MM-DD")}</TableCell>
                <TableCell>{it.type === "income" ? t("income") : t("expense")}</TableCell>
                <TableCell>{it.amount.toFixed(2)}</TableCell>
                <TableCell>{it.currency}</TableCell>
                <TableCell>
                  {it.categories.map((c) => (
                    <Chip key={c.id} label={c.name} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                  ))}
                </TableCell>
                <TableCell>
                  {it.tags.map((x) => (
                    <Chip key={x.id} label={x.name} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                  ))}
                </TableCell>
                <TableCell sx={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {it.note || ""}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => toggleVoided(it)}>
                    {it.is_voided ? t("restore") : t("void")}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(null);
                      setType(it.type);
                      setAmount(it.amount);
                      setCurrency(it.currency);
                      setOccurredAt(dayjs(it.occurred_at));
                      setNote(it.note || "");
                      setSelectedCategories(it.categories || []);
                      setSelectedTags(it.tags || []);
                      setOpen(true);
                    }}
                  >
                    {t("copy")}
                  </Button>
                  <Button size="small" onClick={() => openEdit(it)}>
                    {t("edit")}
                  </Button>
                  <Button color="error" size="small" onClick={() => del(it.id)}>
                    {t("delete")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t("edit") : t("create")}</DialogTitle>
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
              {currencies.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <DatePicker label={t("occurredAt")} value={occurredAt} onChange={(v) => v && setOccurredAt(v)} />
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
            <TextField label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={save} variant="contained">
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </Stack>
  );
}
