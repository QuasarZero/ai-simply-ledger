import React, { useEffect, useMemo, useState } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { api } from "../api/client";

type Summary = {
  totals: { income: number; expense: number; net: number; currency: string };
  by_day: { date: string; income: number; expense: number }[];
  by_category: { category_id: number; name: string; income: number; expense: number }[];
};

export function DashboardPage() {
  const { t } = useTranslation();
  const [start, setStart] = useState<Dayjs>(dayjs().add(-30, "day"));
  const [end, setEnd] = useState<Dayjs>(dayjs());
  const [data, setData] = useState<Summary | null>(null);

  const params = useMemo(
    () => ({
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      base_currency: "CNY"
    }),
    [start, end]
  );

  useEffect(() => {
    api
      .get("/stats/summary", { params })
      .then((r) => setData(r.data as Summary))
      .catch(() => setData(null));
  }, [params]);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <DatePicker label={t("startDate")} value={start} onChange={(v) => v && setStart(v)} />
          <DatePicker label={t("endDate")} value={end} onChange={(v) => v && setEnd(v)} />
          <Box sx={{ flexGrow: 1 }} />
          <Typography>
            {t("income")}: {data?.totals.income?.toFixed(2) ?? "-"} {data?.totals.currency ?? "CNY"}
          </Typography>
          <Typography>
            {t("expense")}: {data?.totals.expense?.toFixed(2) ?? "-"} {data?.totals.currency ?? "CNY"}
          </Typography>
          <Typography>
            {t("net")}: {data?.totals.net?.toFixed(2) ?? "-"} {data?.totals.currency ?? "CNY"}
          </Typography>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, height: 320 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {t("dashboard")}
        </Typography>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data?.by_day ?? []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="income" stroke="#2e7d32" name={t("income")} />
            <Line type="monotone" dataKey="expense" stroke="#d32f2f" name={t("expense")} />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      <Paper sx={{ p: 2, height: 320 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {t("categories")}
        </Typography>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data?.by_category ?? []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="income" fill="#2e7d32" name={t("income")} />
            <Bar dataKey="expense" fill="#d32f2f" name={t("expense")} />
          </BarChart>
        </ResponsiveContainer>
      </Paper>
    </Stack>
  );
}

