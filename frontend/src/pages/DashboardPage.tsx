import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Box, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import dayjs from "../dayjs";
import { DateRangePresets, type PresetKey } from "../components/DateRangePresets";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";

export type DashboardData = {
  totals: { income: number; expense: number; net: number; currency: string };
  by_day: { date: string; income: number; expense: number }[];
  income_expense_pie: { id: number; name: string; value: number }[];
  category_pie_amount: { id: number; name: string; value: number }[];
  category_pie_count: { id: number; name: string; value: number }[];
  tag_pie_amount: { id: number; name: string; value: number }[];
  tag_pie_count: { id: number; name: string; value: number }[];
  top_expense_transactions: {
    id: number;
    occurred_at: string;
    amount_base: number;
    currency: string;
    amount_raw: number;
    note?: string | null;
    categories: string[];
    tags: string[];
  }[];
  top_expense_categories_amount: { id: number; name: string; value: number }[];
  top_expense_tags_amount: { id: number; name: string; value: number }[];
  top_categories_count: { id: number; name: string; value: number }[];
  top_tags_count: { id: number; name: string; value: number }[];
};

const OverviewTab = React.lazy(() => import("./dashboard/OverviewTab"));
const CategoriesTab = React.lazy(() => import("./dashboard/CategoriesTab"));
const TagsTab = React.lazy(() => import("./dashboard/TagsTab"));
const TopTab = React.lazy(() => import("./dashboard/TopTab"));

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
  if (value !== index) return null;
  return <Box sx={{ mt: 2 }}>{children}</Box>;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState(0);
  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange(
    "dateRange:dashboard",
    30
  );

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
      .get("/stats/dashboard", { params })
      .then((r) => setData(r.data as DashboardData))
      .catch(() => setData(null));
  }, [params]);

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

      <Paper sx={{ p: 1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label={t("dashboard")} />
          <Tab label={t("categories")} />
          <Tab label={t("tags")} />
          <Tab label={t("top10")} />
        </Tabs>
      </Paper>

      <Suspense fallback={<Paper sx={{ p: 2 }}>Loading…</Paper>}>
        <TabPanel value={tab} index={0}>
          <OverviewTab data={data} />
        </TabPanel>
        <TabPanel value={tab} index={1}>
          <CategoriesTab data={data} />
        </TabPanel>
        <TabPanel value={tab} index={2}>
          <TagsTab data={data} />
        </TabPanel>
        <TabPanel value={tab} index={3}>
          <TopTab data={data} />
        </TabPanel>
      </Suspense>
    </Stack>
  );
}
