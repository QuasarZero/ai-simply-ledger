import { MenuItem, TextField } from "@mui/material";
import type { Dayjs } from "dayjs";
import dayjs from "../dayjs";
import { useTranslation } from "react-i18next";

export type PresetKey =
  | "today"
  | "yesterday"
  | "last3"
  | "last7"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "last3Months"
  | "last6Months"
  | "last1Year"
  | "lastYear"
  | "custom";

function computeRange(preset: PresetKey, now: Dayjs): { start: Dayjs; end: Dayjs } | null {
  const today = now.startOf("day");
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const d = today.subtract(1, "day");
      return { start: d, end: d };
    }
    case "last3":
      return { start: today.subtract(2, "day"), end: today };
    case "last7":
      return { start: today.subtract(6, "day"), end: today };
    case "thisWeek":
      return { start: today.startOf("isoWeek"), end: today.endOf("isoWeek").startOf("day") };
    case "thisMonth":
      return { start: today.startOf("month"), end: today.endOf("month").startOf("day") };
    case "lastMonth": {
      const last = today.subtract(1, "month");
      return { start: last.startOf("month"), end: last.endOf("month").startOf("day") };
    }
    case "last3Months":
      return { start: today.subtract(3, "month"), end: today };
    case "last6Months":
      return { start: today.subtract(6, "month"), end: today };
    case "last1Year":
      return { start: today.subtract(1, "year"), end: today };
    case "lastYear": {
      const last = today.subtract(1, "year");
      return { start: last.startOf("year"), end: last.endOf("year").startOf("day") };
    }
    case "custom":
    default:
      return null;
  }
}

export function DateRangePresets({
  value,
  onChange,
  setStart,
  setEnd
}: {
  value: PresetKey;
  onChange: (v: PresetKey) => void;
  setStart: (d: Dayjs) => void;
  setEnd: (d: Dayjs) => void;
}) {
  const { t } = useTranslation();

  const options: { key: PresetKey; label: string }[] = [
    { key: "today", label: t("presetToday") },
    { key: "yesterday", label: t("presetYesterday") },
    { key: "last3", label: t("presetLast3Days") },
    { key: "last7", label: t("presetLast7Days") },
    { key: "thisWeek", label: t("presetThisWeek") },
    { key: "thisMonth", label: t("presetThisMonth") },
    { key: "lastMonth", label: t("presetLastMonth") },
    { key: "last3Months", label: t("presetLast3Months") },
    { key: "last6Months", label: t("presetLast6Months") },
    { key: "last1Year", label: t("presetLast1Year") },
    { key: "lastYear", label: t("presetLastYear") },
    { key: "custom", label: t("presetCustom") }
  ];

  function apply(next: PresetKey) {
    onChange(next);
    const range = computeRange(next, dayjs());
    if (range) {
      setStart(range.start);
      setEnd(range.end);
    }
  }

  return (
    <TextField
      select
      size="small"
      label={t("presetRange")}
      value={value}
      onChange={(e) => apply(e.target.value as PresetKey)}
      sx={{ minWidth: 170 }}
    >
      {options.map((o) => (
        <MenuItem key={o.key} value={o.key}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

