import React, { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";

type Category = { id: number; name: string; description?: string | null };
type Tag = { id: number; name: string };

type Tx = {
  id: number;
  type: "income" | "expense";
  amount: number;
  currency: string;
  occurred_at: string;
  note?: string | null;
  categories: Category[];
  tags: Tag[];
};

const currencies = ["CNY", "USD", "EUR", "JPY", "HKD", "GBP"];

export function TransactionsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [start, setStart] = useState<Dayjs>(dayjs().add(-30, "day"));
  const [end, setEnd] = useState<Dayjs>(dayjs());
  const [q, setQ] = useState("");

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
      q: q || undefined
    }),
    [start, end, q]
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

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <DatePicker label={t("startDate")} value={start} onChange={(v) => v && setStart(v)} />
          <DatePicker label={t("endDate")} value={end} onChange={(v) => v && setEnd(v)} />
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
              options={tags}
              getOptionLabel={(o) => o.name}
              value={selectedTags}
              onChange={(_, v) => setSelectedTags(v)}
              renderInput={(params) => <TextField {...params} label={t("tags")} />}
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
