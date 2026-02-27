import { useMemo, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Stack, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";

type Props = {
  page: number; // 0-based
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  maxPageSize?: number;
};

const PRESET_SIZES = [20, 50, 100, 500] as const;

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  maxPageSize = 500
}: Props) {
  const { t } = useTranslation();
  const totalPages = useMemo(() => Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize))), [total, pageSize]);

  const selectValue = PRESET_SIZES.includes(pageSize as any) ? String(pageSize) : "custom";
  const customLabel =
    selectValue === "custom" ? `${t("custom")} (${pageSize})` : t("custom");

  const [openCustom, setOpenCustom] = useState(false);
  const [customValue, setCustomValue] = useState(String(pageSize));

  function openDialog() {
    setCustomValue(String(pageSize));
    setOpenCustom(true);
  }

  function saveCustom() {
    const n = Number(customValue);
    if (!Number.isFinite(n) || n <= 0) return;
    const clamped = Math.min(Math.max(1, Math.floor(n)), maxPageSize);
    onPageSizeChange(clamped);
    setOpenCustom(false);
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mt: 1 }}>
      <Pagination
        count={totalPages}
        page={Math.min(totalPages, Math.max(1, page + 1))}
        onChange={(_, p) => onPageChange(p - 1)}
        size="small"
        color="primary"
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          select
          label={t("rowsPerPage")}
          size="small"
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "custom") {
              openDialog();
              return;
            }
            onPageSizeChange(Number(v));
          }}
          sx={{ width: 180 }}
        >
          {PRESET_SIZES.map((n) => (
            <MenuItem key={n} value={String(n)}>
              {n}
            </MenuItem>
          ))}
          <MenuItem value="custom">{customLabel}</MenuItem>
        </TextField>
        <Button variant="outlined" size="small" onClick={() => onPageChange(0)} disabled={page === 0}>
          {t("page")} 1
        </Button>
      </Stack>

      <Dialog open={openCustom} onClose={() => setOpenCustom(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("custom")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t("rowsPerPage")}
            type="number"
            fullWidth
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            inputProps={{ min: 1, max: maxPageSize, step: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCustom(false)}>{t("cancel")}</Button>
          <Button variant="contained" onClick={saveCustom}>
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

