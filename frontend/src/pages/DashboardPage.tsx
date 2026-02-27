import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, Paper, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { DateRangePresets } from "../components/DateRangePresets";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";
import { useAuth } from "../auth/AuthContext";

export type DashboardData = {
  requested_user_id?: number | null;
  effective_user_id?: number | null;
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

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
  if (value !== index) return null;
  return <Box sx={{ mt: 2 }}>{children}</Box>;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState(0);
  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange(
    "dateRange:dashboard",
    30
  );

  const isAdmin = !!me?.is_admin;
  const [adminUsers, setAdminUsers] = useState<{ id: number; username: string; email: string; is_active: boolean }[]>(
    []
  );
  const [selectedUserId, setSelectedUserId] = useState<number>(() => {
    const raw = localStorage.getItem("dashboard:userId");
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  });

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/admin/users")
      .then((r) => setAdminUsers((r.data || []) as any))
      .catch(() => setAdminUsers([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    localStorage.setItem("dashboard:userId", String(selectedUserId));
  }, [isAdmin, selectedUserId]);

  const userOptions = useMemo(() => {
    if (!isAdmin) return [];
    const base = [{ id: 0, label: t("global") }];
    const rest = adminUsers
      .filter((u) => u.is_active)
      .map((u) => ({ id: u.id, label: `${u.username} (${u.email})` }));
    return [...base, ...rest];
  }, [adminUsers, isAdmin, t]);

  const selectedOption = useMemo(() => {
    if (!isAdmin) return null;
    return userOptions.find((o) => o.id === selectedUserId) || userOptions[0] || null;
  }, [isAdmin, selectedUserId, userOptions]);

  const params = useMemo(
    () => ({
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      base_currency: "CNY",
      user_id: isAdmin ? selectedUserId : undefined
    }),
    [start, end, isAdmin, selectedUserId]
  );

  useEffect(() => {
    api
      .get("/stats/dashboard", { params })
      .then((r) => setData(r.data as DashboardData))
      .catch(() => setData(null));
  }, [params]);

  useEffect(() => {
    if (tab > 2) setTab(0);
  }, [tab]);

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
          {isAdmin ? (
            <Autocomplete
              options={userOptions}
              value={selectedOption}
              onChange={(_, v) => setSelectedUserId(v?.id ?? 0)}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <TextField {...params} label={t("user")} size="small" />}
              sx={{ minWidth: 260 }}
            />
          ) : null}
          <Box sx={{ flexGrow: 1 }} />
          {isAdmin ? (
            <Typography variant="body2" sx={{ opacity: 0.75 }}>
              {t("viewing")}: {selectedOption?.label || t("global")}
            </Typography>
          ) : null}
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
        </Tabs>
      </Paper>

      <Suspense fallback={<Paper sx={{ p: 2 }}>{t("loading")}</Paper>}>
        <TabPanel value={tab} index={0}>
          <OverviewTab data={data} />
        </TabPanel>
        <TabPanel value={tab} index={1}>
          <CategoriesTab data={data} />
        </TabPanel>
        <TabPanel value={tab} index={2}>
          <TagsTab data={data} />
        </TabPanel>
      </Suspense>
    </Stack>
  );
}
