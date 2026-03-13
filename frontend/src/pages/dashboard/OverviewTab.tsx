import * as React from "react";
import { Box, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useTranslation } from "react-i18next";

import type { DashboardData } from "../DashboardPage";
import { api } from "../../api/client";
import PieCard from "./PieCard";
import { Top10ExpenseTransactions, Top10IncomeTransactions } from "./TopWidgets";
import { formatMoney } from "../../formatMoney";
import dayjs, { type Dayjs } from "../../dayjs";

type MonthlyTrend = { currency: string; months: { month: string; income: number; expense: number }[] };

export default function OverviewTab({
  data,
  preset,
  end,
  baseCurrency,
  isAdmin,
  selectedUserId
}: {
  data: DashboardData | null;
  preset: string;
  end: Dayjs;
  baseCurrency: string;
  isAdmin: boolean;
  selectedUserId: number;
}) {
  const { t } = useTranslation();
  const [hoverSeries, setHoverSeries] = React.useState<"income" | "expense" | null>(null);
  const [hiddenSeries, setHiddenSeries] = React.useState<{ income: boolean; expense: boolean }>({
    income: false,
    expense: false
  });
  const [monthly, setMonthly] = React.useState<MonthlyTrend | null>(null);
  const [loadingMonthly, setLoadingMonthly] = React.useState(false);
  const [monthsSpan, setMonthsSpan] = React.useState<number>(() => {
    const raw = localStorage.getItem("dashboard:monthsSpan");
    const n = raw ? Number(raw) : 12;
    return Number.isFinite(n) && n > 0 ? n : 12;
  });

  React.useEffect(() => {
    localStorage.setItem("dashboard:monthsSpan", String(monthsSpan));
  }, [monthsSpan]);

  const monthlyParams = React.useMemo(() => {
    const endDay = preset === "all" ? dayjs() : end;
    return {
      base_currency: baseCurrency,
      user_id: isAdmin ? selectedUserId : undefined,
      months: monthsSpan,
      end: endDay.format("YYYY-MM-DD")
    };
  }, [baseCurrency, end, isAdmin, monthsSpan, preset, selectedUserId]);

  React.useEffect(() => {
    setLoadingMonthly(true);
    api
      .get("/stats/monthly_trend", { params: monthlyParams })
      .then((r) => setMonthly(r.data as MonthlyTrend))
      .catch(() => setMonthly(null))
      .finally(() => setLoadingMonthly(false));
  }, [monthlyParams]);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2, height: 320, display: "flex", flexDirection: "column" }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {t("trend")}
        </Typography>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.by_day ?? []} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
              <Line
                type="monotone"
                dataKey="income"
                stroke="#2e7d32"
                name={t("income")}
                hide={hiddenSeries.income}
                opacity={hoverSeries != null && hoverSeries !== "income" ? 0.2 : 1}
                strokeWidth={hoverSeries === "income" ? 3 : 2}
              />
              <Line
                type="monotone"
                dataKey="expense"
                stroke="#d32f2f"
                name={t("expense")}
                hide={hiddenSeries.expense}
                opacity={hoverSeries != null && hoverSeries !== "expense" ? 0.2 : 1}
                strokeWidth={hoverSeries === "expense" ? 3 : 2}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
        <Box
          sx={{
            mt: 1,
            display: "flex",
            flexWrap: "wrap",
            gap: 1.5
          }}
        >
          <Box
            onMouseEnter={() => setHoverSeries(hiddenSeries.income ? null : "income")}
            onMouseLeave={() => setHoverSeries(null)}
            onClick={() => setHiddenSeries((s) => ({ ...s, income: !s.income }))}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              cursor: "pointer",
              userSelect: "none",
              opacity: hiddenSeries.income ? 0.4 : 1,
              textDecoration: hiddenSeries.income ? "line-through" : "none"
            }}
          >
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: "#2e7d32", flex: "0 0 auto" }} />
            <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
              {t("income")}
            </Typography>
          </Box>
          <Box
            onMouseEnter={() => setHoverSeries(hiddenSeries.expense ? null : "expense")}
            onMouseLeave={() => setHoverSeries(null)}
            onClick={() => setHiddenSeries((s) => ({ ...s, expense: !s.expense }))}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              cursor: "pointer",
              userSelect: "none",
              opacity: hiddenSeries.expense ? 0.4 : 1,
              textDecoration: hiddenSeries.expense ? "line-through" : "none"
            }}
          >
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: "#d32f2f", flex: "0 0 auto" }} />
            <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
              {t("expense")}
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 2, height: 320, display: "flex", flexDirection: "column" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, gap: 2 }}>
          <Typography variant="subtitle1" sx={{ minWidth: 0 }}>
            {t("monthlyTrend")}{" "}
            <Typography component="span" variant="caption" sx={{ opacity: 0.7 }}>
              ({monthly?.currency || data?.totals.currency || "CNY"})
            </Typography>
          </Typography>
          <TextField
            select
            label={t("monthsSpan")}
            value={monthsSpan}
            onChange={(e) => setMonthsSpan(Number(e.target.value) || 12)}
            size="small"
            sx={{ width: 140, flex: "0 0 auto" }}
          >
            {[3, 6, 12, 18, 24, 36].map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {loadingMonthly ? (
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              {t("loading")}
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly?.months ?? []} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                <Line type="monotone" dataKey="income" stroke="#2e7d32" name={t("income")} strokeWidth={2} />
                <Line type="monotone" dataKey="expense" stroke="#d32f2f" name={t("expense")} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Box>
      </Paper>

      <PieCard
        title={t("incomeVsExpense")}
        data={data?.income_expense_pie ?? []}
        transformName={(name) => {
          if (name === "Income") return t("income");
          if (name === "Expense") return t("expense");
          if (name === "Other") return t("other");
          return name;
        }}
      />

      <Top10ExpenseTransactions data={data} />
      <Top10IncomeTransactions data={data} />
    </Stack>
  );
}
