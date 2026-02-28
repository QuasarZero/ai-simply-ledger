import { useEffect, useMemo, useState } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "../dayjs";
import type { PresetKey } from "../components/DateRangePresets";

type Persisted = {
  preset: PresetKey;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
};

function safeParse(key: string): Persisted | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<Persisted>;
    if (!obj.start || !obj.end) return null;
    const s = dayjs(String(obj.start));
    const e = dayjs(String(obj.end));
    if (!s.isValid() || !e.isValid()) return null;
    const preset = (obj.preset as PresetKey) || "custom";
    return { preset, start: s.format("YYYY-MM-DD"), end: e.format("YYYY-MM-DD") };
  } catch {
    return null;
  }
}

export function usePersistedDateRange(storageKey: string, defaultLastDays = 30) {
  const initial = useMemo(() => {
    const persisted = safeParse(storageKey);
    if (persisted) {
      return {
        preset: persisted.preset,
        start: dayjs(persisted.start),
        end: dayjs(persisted.end)
      };
    }
    return {
      preset: "custom" as PresetKey,
      start: dayjs().add(-defaultLastDays, "day"),
      end: dayjs()
    };
  }, [storageKey, defaultLastDays]);

  const [preset, setPreset] = useState<PresetKey>(initial.preset);
  const [start, setStart] = useState<Dayjs>(initial.start);
  const [end, setEnd] = useState<Dayjs>(initial.end);

  useEffect(() => {
    const payload: Persisted = {
      preset,
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD")
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [preset, start, end, storageKey]);

  return { preset, setPreset, start, setStart, end, setEnd };
}
