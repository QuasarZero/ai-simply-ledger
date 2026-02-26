import React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
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
import PieCard from "./PieCard";

export default function OverviewTab({ data }: { data: DashboardData | null }) {
  const { t } = useTranslation();
  const [hoverSeries, setHoverSeries] = React.useState<"income" | "expense" | null>(null);
  const [hiddenSeries, setHiddenSeries] = React.useState<{ income: boolean; expense: boolean }>({
    income: false,
    expense: false
  });
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
              <Tooltip />
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
    </Stack>
  );
}
