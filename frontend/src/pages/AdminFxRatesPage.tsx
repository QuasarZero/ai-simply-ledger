import { useEffect, useMemo, useState } from "react";
import { Box, Button, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { DateRangePresets } from "../components/DateRangePresets";
import { YearMonthCalendarHeader } from "../components/YearMonthCalendarHeader";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";
import { emitToast } from "../components/toastBus";

type FxSyncResult = { days: number; currencies: number; rows_upserted: number };

export function AdminFxRatesPage() {
  const { t } = useTranslation();
  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange("dateRange:fxSync", 30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FxSyncResult | null>(null);

  useEffect(() => {
    document.title = `${t("fxRates")} | ${t("appTitle")}`;
  }, [t]);

  const canSync = useMemo(() => preset !== "all" && !!start && !!end, [preset, start, end]);

  async function sync() {
    if (!canSync) {
      emitToast({ severity: "error", message: t("dateRangeRequired") });
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/admin/fx/sync", {
        start: start.format("YYYY-MM-DD"),
        end: end.format("YYYY-MM-DD")
      });
      setResult(res.data as FxSyncResult);
      emitToast({ severity: "success", message: t("syncCompleted") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Typography variant="h6">{t("fxRates")}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" disabled={!canSync || loading} onClick={sync}>
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
    </Stack>
  );
}

