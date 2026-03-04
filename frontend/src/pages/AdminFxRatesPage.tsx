import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { DateRangePresets } from "../components/DateRangePresets";
import { YearMonthCalendarHeader } from "../components/YearMonthCalendarHeader";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";
import { emitToast } from "../components/toastBus";
import dayjs from "../dayjs";
import { PaginationBar } from "../components/PaginationBar";
import { safeParseJson } from "../storage";

type FxSyncResult = { days: number; currencies: number; rows_upserted: number };
type FxSyncJobStart = { job_id: string };
type FxSyncJobStatus = {
  job_id: string;
  status: "running" | "success" | "partial" | "error";
  started_at: number;
  updated_at: number;
  progress_percent: number;
  provider?: string | null;
  provider_index: number;
  provider_total: number;
  day_total: number;
  day_done: number;
  missing_total: number;
  missing_remaining: number;
  rows_upserted: number;
  message: string;
  error?: string | null;
  result?: FxSyncResult | null;
};
type Currency = { code: string; name: string };
type FxRateRow = { rate_date: string; currency: string; usd_rate: number; source: string };
type SortDir = "asc" | "desc";
type SortKey = "date" | string;
const STORAGE_KEY = "pageState:adminFxRates";

export function AdminFxRatesPage() {
  const { t } = useTranslation();
  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange("dateRange:fxSync", 30);
  const persisted = useMemo(() => safeParseJson<Record<string, any>>(STORAGE_KEY) || {}, []);
  const [loadingSync, setLoadingSync] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [result, setResult] = useState<FxSyncResult | null>(null);
  const [jobId, setJobId] = useState<string>(() => (typeof persisted.jobId === "string" ? persisted.jobId : ""));
  const [job, setJob] = useState<FxSyncJobStatus | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currenciesLoaded, setCurrenciesLoaded] = useState(false);
  const [rows, setRows] = useState<FxRateRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>(() => (typeof persisted.sortKey === "string" ? persisted.sortKey : "date"));
  const [sortDir, setSortDir] = useState<SortDir>(() =>
    persisted.sortDir === "asc" || persisted.sortDir === "desc" ? persisted.sortDir : "desc"
  );
  const [pageSize, setPageSize] = useState<number>(() => {
    const v = persisted.pageSize;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 50;
  });
  const [page, setPage] = useState<number>(() => {
    const v = persisted.page;
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  });

  useEffect(() => {
    document.title = `${t("fxRates")} | ${t("appTitle")}`;
  }, [t]);

  const canSync = useMemo(() => preset !== "all" && !!start && !!end, [preset, start, end]);
  const rangeKey = useMemo(() => {
    if (preset === "all") return "all";
    return `${start.format("YYYY-MM-DD")}..${end.format("YYYY-MM-DD")}`;
  }, [preset, start, end]);
  const lastRangeKey = useRef<string>("");

  useEffect(() => {
    api
      .get("/currencies")
      .then((r) => setCurrencies((r.data || []) as Currency[]))
      .catch(() => setCurrencies([]))
      .finally(() => setCurrenciesLoaded(true));
  }, []);

  async function loadRates() {
    if (preset === "all") return;
    setLoadingList(true);
    try {
      const res = await api.get("/admin/fx/rates", {
        params: { start: start.format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") }
      });
      setRows((res.data || []) as FxRateRow[]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    // Reset to page 1 only when the date range changes (not on initial mount restore).
    if (!lastRangeKey.current) {
      lastRangeKey.current = rangeKey;
    } else if (lastRangeKey.current !== rangeKey) {
      lastRangeKey.current = rangeKey;
      setPage(0);
    }
    loadRates().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  async function sync() {
    if (!canSync) {
      emitToast({ severity: "error", message: t("dateRangeRequired") });
      return;
    }
    setLoadingSync(true);
    try {
      const res = await api.post("/admin/fx/sync", {
        start: start.format("YYYY-MM-DD"),
        end: end.format("YYYY-MM-DD")
      });
      const data = res.data as FxSyncJobStart;
      setJobId(data.job_id);
      setJob(null);
      setResult(null);
    } catch (e: any) {
      setLoadingSync(false);
      emitToast({ severity: "error", message: t("syncFailed") });
    }
  }

  const currencyCodes = useMemo(() => {
    const base = currencies.map((c) => c.code.toUpperCase());
    const out = base.includes("USD") ? base : ["USD", ...base];
    return out.length ? out : ["USD", "CNY", "EUR", "JPY", "HKD", "GBP"];
  }, [currencies]);

  useEffect(() => {
    const payload = { sortKey, sortDir, page, pageSize, jobId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [jobId, page, pageSize, sortDir, sortKey]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let stopped = false;
    setLoadingSync(true);

    const stop = (intervalId?: any) => {
      if (stopped) return;
      stopped = true;
      if (intervalId) clearInterval(intervalId);
    };

    const tick = async () => {
      if (cancelled || stopped) return;
      const res = await api.get(`/admin/fx/sync/${jobId}`);
      if (cancelled || stopped) return;
      const st = res.data as FxSyncJobStatus;
      setJob(st);
      if (st.status === "success" || st.status === "partial" || st.status === "error") {
        // Stop polling first to avoid repeated completion toasts/refreshes.
        stop(intervalId);
        setLoadingSync(false);
        if (st.result) setResult(st.result);
        if (st.status === "success") emitToast({ severity: "success", message: t("syncCompleted") });
        if (st.status === "partial") emitToast({ severity: "warning", message: t("syncCompletedPartial") });
        if (st.status === "error") emitToast({ severity: "error", message: st.error || t("syncFailed") });
        if (st.status !== "error") await loadRates();
        // Clear jobId so refresh won't re-toast / re-poll completed job.
        setJobId("");
      }
    };

    let intervalId: any = null;
    tick().catch(() => {
      if (cancelled) return;
      stop(intervalId);
      setLoadingSync(false);
      setJob(null);
      setJobId("");
      emitToast({ severity: "error", message: t("syncStatusLost") });
    });
    intervalId = setInterval(() => tick().catch(() => {}), 1000);
    return () => {
      cancelled = true;
      stop(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (!currenciesLoaded) return;
    if (sortKey === "date") return;
    const key = String(sortKey).toUpperCase();
    if (!currencyCodes.includes(key)) setSortKey("date");
  }, [currenciesLoaded, currencyCodes, sortKey]);

  const rateByDateCurrency = useMemo(() => {
    const map = new Map<string, Map<string, FxRateRow>>();
    for (const r of rows) {
      const d = r.rate_date;
      const c = (r.currency || "").toUpperCase();
      if (!map.has(d)) map.set(d, new Map());
      map.get(d)!.set(c, r);
    }
    return map;
  }, [rows]);

  const dateRows = useMemo(() => {
    if (preset === "all") return [];
    const s = start.startOf("day");
    const e = end.startOf("day");
    if (e.isBefore(s)) return [];
    const days: string[] = [];
    let cur = s;
    while (cur.isBefore(e) || cur.isSame(e)) {
      days.push(cur.format("YYYY-MM-DD"));
      cur = cur.add(1, "day");
      if (days.length > 5000) break; // safety guard
    }
    return days;
  }, [preset, start, end]);

  function valueAt(dateStr: string, code: string): number | null {
    const c = code.toUpperCase();
    if (c === "USD") return 1;
    const m = rateByDateCurrency.get(dateStr);
    const row = m?.get(c);
    return row ? Number(row.usd_rate) : null;
  }

  function requestSort(next: SortKey) {
    if (next === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir(next === "date" ? "desc" : "asc");
  }

  const sortedDates = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const base = [...dateRows];
    if (sortKey === "date") {
      base.sort((a, b) => a.localeCompare(b) * dir);
      return base;
    }
    const code = String(sortKey).toUpperCase();
    base.sort((a, b) => {
      const va = valueAt(a, code);
      const vb = valueAt(b, code);
      if (va == null && vb == null) return a.localeCompare(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      const diff = va - vb;
      return diff === 0 ? a.localeCompare(b) : diff * dir;
    });
    return base;
  }, [dateRows, sortDir, sortKey, rateByDateCurrency]);

  const pagedDates = useMemo(() => {
    const startIdx = page * pageSize;
    return sortedDates.slice(startIdx, startIdx + pageSize);
  }, [page, pageSize, sortedDates]);

  useEffect(() => {
    if (page === 0) return;
    if (page * pageSize >= sortedDates.length) setPage(0);
  }, [page, pageSize, sortedDates.length]);

  function formatRate(v: number | null) {
    if (v == null) return "-";
    const s = Number(v).toFixed(6);
    return s.replace(/\.?0+$/, "");
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        {loadingSync ? (
          <Box sx={{ mb: 2 }}>
            <LinearProgress variant="determinate" value={job?.progress_percent ?? 0} />
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.85 }}>
              {job?.provider ? `${t("provider")}: ${job.provider}` : null}
              {job?.message ? ` ${job.message}` : null}
            </Typography>
          </Box>
        ) : null}
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Typography variant="h6">{t("fxRates")}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" disabled={!canSync || loadingSync} onClick={sync}>
            {t("sync")}
          </Button>
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mt: 2 }}>
          <DateRangePresets value={preset} onChange={setPreset} setStart={setStart} setEnd={setEnd} />
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
            slotProps={{ textField: { size: "small" }, actionBar: { actions: ["today"] } }}
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
            slotProps={{ textField: { size: "small" }, actionBar: { actions: ["today"] } }}
          />
        </Stack>

        {result ? (
          <Typography variant="body2" sx={{ mt: 2, opacity: 0.85 }}>
            {t("syncFxRates")}: {result.days}d, {result.currencies} currencies, {result.rows_upserted} rows
          </Typography>
        ) : null}
      </Paper>

      <Paper sx={{ p: 2 }}>
        {loadingList ? <LinearProgress sx={{ mb: 2 }} /> : null}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle1">
            {t("fxRates")} ({sortedDates.length})
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
        </Stack>

        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ tableLayout: "fixed", minWidth: Math.max(700, 120 + currencyCodes.length * 120) }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 120 }} sortDirection={sortKey === "date" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "date"}
                    direction={sortKey === "date" ? sortDir : "desc"}
                    onClick={() => requestSort("date")}
                  >
                    {t("date")}
                  </TableSortLabel>
                </TableCell>
                {currencyCodes.map((c) => (
                  <TableCell key={c} sx={{ width: 120 }} sortDirection={sortKey === c ? sortDir : false}>
                    <TableSortLabel
                      active={sortKey === c}
                      direction={sortKey === c ? sortDir : "asc"}
                      onClick={() => requestSort(c)}
                    >
                      {c}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedDates.map((d) => (
                <TableRow key={d}>
                  <TableCell>{d}</TableCell>
                  {currencyCodes.map((c) => (
                    <TableCell key={c}>{formatRate(valueAt(d, c))}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={sortedDates.length}
          onChangePage={setPage}
          onChangePageSize={(n) => {
            setPage(0);
            setPageSize(n);
          }}
        />
      </Paper>
    </Stack>
  );
}
