import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Paper,
  FormControlLabel,
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
import type { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import dayjs from "../dayjs";
import { DateRangePresets, type PresetKey } from "../components/DateRangePresets";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";

type Tx = {
  id: number;
  user_id: number;
  type: "income" | "expense";
  amount: number;
  currency: string;
  occurred_at: string;
  note?: string | null;
  is_voided: boolean;
};

export function AdminTransactionsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Tx[]>([]);
  const [userId, setUserId] = useState<string>("");
  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange(
    "dateRange:adminTransactions",
    30
  );
  const [voided, setVoided] = useState(false);

  useEffect(() => {
    const key = "filter:adminTransactions:voided";
    const saved = localStorage.getItem(key);
    if (saved === "true") setVoided(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("filter:adminTransactions:voided", voided ? "true" : "false");
  }, [voided]);

  const params = useMemo(
    () => ({
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      user_id: userId ? Number(userId) : undefined,
      voided: voided ? true : undefined
    }),
    [start, end, userId, voided]
  );

  async function load() {
    const res = await api.get("/admin/transactions", { params });
    setItems((res.data.items || []) as Tx[]);
  }

  useEffect(() => {
    load().catch(() => {});
  }, [params]);

  async function del(txId: number) {
    await api.delete(`/admin/transactions/${txId}`);
    await load();
  }

  async function toggleVoided(tx: Tx) {
    await api.patch(`/admin/transactions/${tx.id}`, { is_voided: !tx.is_voided });
    await load();
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
            label="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            size="small"
            sx={{ width: 140 }}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={() => load()}>{t("search")}</Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {t("adminTransactions")}
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>User</TableCell>
              <TableCell>{t("occurredAt")}</TableCell>
              <TableCell>{t("type")}</TableCell>
              <TableCell>{t("amount")}</TableCell>
              <TableCell>{t("currency")}</TableCell>
              <TableCell>{t("note")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell>{it.id}</TableCell>
                <TableCell>{it.user_id}</TableCell>
                <TableCell>{dayjs(it.occurred_at).format("YYYY-MM-DD")}</TableCell>
                <TableCell>{it.type === "income" ? t("income") : t("expense")}</TableCell>
                <TableCell>{it.amount.toFixed(2)}</TableCell>
                <TableCell>{it.currency}</TableCell>
                <TableCell sx={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {it.note || ""}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => toggleVoided(it)}>
                    {it.is_voided ? t("restore") : t("void")}
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
    </Stack>
  );
}
