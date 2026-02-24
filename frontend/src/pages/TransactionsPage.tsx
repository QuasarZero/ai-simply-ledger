import React, { useEffect, useMemo, useState } from "react";
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
import { DateRangePresets, type PresetKey } from "../components/DateRangePresets";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";

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
  const [items, setItems] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [q, setQ] = useState("");
  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange(
    "dateRange:transactions",
    30
  );
  const [voided, setVoided] = useState(false);

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

  const params = useMemo(
    () => ({
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      q: q || undefined,
      voided: voided ? true : undefined
    }),
    [start, end, q, voided]
  );

  async function loadMeta() {
    const [cRes, tRes] = await Promise.all([api.get("/categories"), api.get("/tags")]);
    setCategories(cRes.data as Category[]);
    setTags(tRes.data as Tag[]);
  }

  async function load() {
    const res = await api.get("/transactions", { params });
    setItems((res.data.items || []) as Tx[]);
  }

  useEffect(() => {
    loadMeta().catch(() => {});
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [params]);

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
    await load();
  }

  async function del(txId: number) {
    await api.delete(`/transactions/${txId}`);
    await load();
  }

  async function toggleVoided(tx: Tx) {
    await api.patch(`/transactions/${tx.id}`, { is_voided: !tx.is_voided });
    await load();
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
          <TextField
            label={t("search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            size="small"
            sx={{ minWidth: 240 }}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" onClick={openCreate}>
            {t("create")}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {t("transactions")}
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
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
                  <Button size="small" onClick={() => openEdit(it)}>
                    Edit
                  </Button>
                  <Button color="error" size="small" onClick={() => del(it.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit" : t("create")}</DialogTitle>
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
    </Stack>
  );
}
