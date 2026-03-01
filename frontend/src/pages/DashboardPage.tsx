import * as React from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, LinearProgress, Paper, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { DateRangePresets } from "../components/DateRangePresets";
import { YearMonthCalendarHeader } from "../components/YearMonthCalendarHeader";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";
import { useAuth } from "../auth/AuthContext";
import { formatMoney } from "../formatMoney";

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
  top_income_transactions: {
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
  const [loading, setLoading] = useState(false);
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

  const params = useMemo(() => {
    const p: Record<string, any> = {
      base_currency: "CNY",
      user_id: isAdmin ? selectedUserId : undefined
    };
    if (preset === "all") {
      p.all = true;
    } else {
      p.start = start.format("YYYY-MM-DD");
      p.end = end.format("YYYY-MM-DD");
    }
    return p;
  }, [start, end, isAdmin, selectedUserId, preset]);

  useEffect(() => {
    setLoading(true);
    api
      .get("/stats/dashboard", { params })
      .then((r) => setData(r.data as DashboardData))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    if (tab > 2) setTab(0);
  }, [tab]);

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}
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
            disabled={preset === "all"}
            views={["year", "month", "day"]}
            format="YYYY-MM-DD"
            onChange={(v) => {
              if (!v) return;
              setPreset("custom");
              setStart(v);
            }}
            slots={{ calendarHeader: YearMonthCalendarHeader }}
            slotProps={{
              textField: { size: "small" },
              actionBar: { actions: ["today"] }
            }}
          />
          <DatePicker
            label={t("endDate")}
            value={end}
            disabled={preset === "all"}
            views={["year", "month", "day"]}
            format="YYYY-MM-DD"
            onChange={(v) => {
              if (!v) return;
              setPreset("custom");
              setEnd(v);
            }}
            slots={{ calendarHeader: YearMonthCalendarHeader }}
            slotProps={{
              textField: { size: "small" },
              actionBar: { actions: ["today"] }
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
            {t("income")}: {data ? formatMoney(data.totals.income) : "-"} {data?.totals.currency ?? "CNY"}
          </Typography>
          <Typography>
            {t("expense")}: {data ? formatMoney(data.totals.expense) : "-"} {data?.totals.currency ?? "CNY"}
          </Typography>
          <Typography>
            {t("net")}: {data ? formatMoney(data.totals.net) : "-"} {data?.totals.currency ?? "CNY"}
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
          {loading ? <Paper sx={{ p: 2 }}>{t("loading")}</Paper> : <OverviewTab data={data} />}
        </TabPanel>
        <TabPanel value={tab} index={1}>
          {loading ? <Paper sx={{ p: 2 }}>{t("loading")}</Paper> : <CategoriesTab data={data} />}
        </TabPanel>
        <TabPanel value={tab} index={2}>
          {loading ? <Paper sx={{ p: 2 }}>{t("loading")}</Paper> : <TagsTab data={data} />}
        </TabPanel>
      </Suspense>
    </Stack>
  );
}
