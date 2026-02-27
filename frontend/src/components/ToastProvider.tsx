import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, IconButton, LinearProgress, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { subscribeToast, type ToastPayload } from "./toastBus";

type ToastItem = ToastPayload & {
  id: number;
  durationMs: number;
  remainingMs: number;
  pinned: boolean;
};

function normalizeMessage(msg: string) {
  const s = String(msg ?? "").trim();
  return s.length > 0 ? s : "Error";
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]); // newest first
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const nextIdRef = useRef(1);
  const intervalRef = useRef<number | null>(null);

  const visibleToasts = useMemo(() => toasts.slice(0, 5), [toasts]);

  function push(payload: ToastPayload) {
    const durationMs = 5000;
    const item: ToastItem = {
      id: nextIdRef.current++,
      severity: payload.severity,
      message: normalizeMessage(payload.message),
      durationMs,
      remainingMs: durationMs,
      pinned: false
    };
    setToasts((prev) => [item, ...prev]);
  }

  function close(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setHoveredId((prev) => (prev === id ? null : prev));
  }

  useEffect(() => {
    return subscribeToast((p) => push(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visibleToasts.length === 0) return;

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    intervalRef.current = window.setInterval(() => {
      setToasts((prev) => {
        if (prev.length === 0) return prev;
        const visibleIds = new Set(prev.slice(0, 5).map((t) => t.id));
        const next = prev
          .map((t) => {
            if (!visibleIds.has(t.id)) return t;
            if (t.pinned) return t;
            const remainingMs = t.remainingMs - 50;
            return { ...t, remainingMs };
          })
          .filter((t) => t.remainingMs > 0);
        return next;
      });
    }, 50);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleToasts.length]);

  useEffect(() => {
    if (visibleToasts.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = visibleToasts[0];
      if (!top) return;
      e.preventDefault();
      close(top.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleToasts]);

  function pin(id: number) {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: true } : t)));
  }

  function progressOf(t: ToastItem) {
    if (t.durationMs <= 0) return 0;
    return Math.max(0, Math.min(100, (t.remainingMs / t.durationMs) * 100));
  }

  return (
    <>
      {children}
      {visibleToasts.length > 0 ? (
        <Box
          sx={{
            position: "fixed",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            zIndex: (theme) => theme.zIndex.snackbar,
            width: { xs: "92vw", sm: 520 },
            pointerEvents: "none"
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[...visibleToasts].reverse().map((t) => {
              const hovered = hoveredId === t.id;
              return (
                <Box
                  key={t.id}
                  onMouseEnter={() => {
                    setHoveredId(t.id);
                    pin(t.id);
                  }}
                  onMouseLeave={() => setHoveredId((prev) => (prev === t.id ? null : prev))}
                  sx={{ pointerEvents: "auto" }}
                >
                  <Alert
                    severity={t.severity}
                    variant="filled"
                    sx={{ position: "relative", pb: 1.5 }}
                    action={
                      hovered ? (
                        <IconButton size="small" color="inherit" onClick={() => close(t.id)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      ) : undefined
                    }
                  >
                    <Typography variant="body2" sx={{ pr: hovered ? 0 : 1 }}>
                      {t.message}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={progressOf(t)}
                      color="inherit"
                      sx={{
                        position: "absolute",
                        left: 0,
                        bottom: 0,
                        width: "100%",
                        height: 3,
                        opacity: hovered ? 0.6 : 0.8
                      }}
                    />
                  </Alert>
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : null}
    </>
  );
}
