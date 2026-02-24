import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
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
import type { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import dayjs from "../dayjs";
import { DateRangePresets, type PresetKey } from "../components/DateRangePresets";

type Tx = {
  id: number;
  user_id: number;
  type: "income" | "expense";
  amount: number;
  currency: string;
  occurred_at: string;
  note?: string | null;
};

export function AdminTransactionsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Tx[]>([]);
  const [start, setStart] = useState<Dayjs>(dayjs().add(-30, "day"));
  const [end, setEnd] = useState<Dayjs>(dayjs());
  const [userId, setUserId] = useState<string>("");
  const [preset, setPreset] = useState<PresetKey>("custom");

  const params = useMemo(
    () => ({
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      user_id: userId ? Number(userId) : undefined
    }),
    [start, end, userId]
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
