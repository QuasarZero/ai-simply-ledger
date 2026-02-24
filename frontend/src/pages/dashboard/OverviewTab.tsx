import React from "react";
import { Paper, Stack, Typography } from "@mui/material";
import {
  CartesianGrid,
  Legend,
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
  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2, height: 320 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {t("trend")}
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
