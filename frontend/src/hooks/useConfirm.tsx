import { useCallback, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

export function useConfirm() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => setResolver(() => resolve));
  }, []);

  function close(result: boolean) {
    setOpen(false);
    resolver?.(result);
    setResolver(null);
  }

  const dialog = (
    <Dialog open={open} onClose={() => close(false)} maxWidth="xs" fullWidth>
      <DialogTitle>{opts?.title || t("confirm")}</DialogTitle>
      <DialogContent>
        <Typography sx={{ mt: 1 }}>{opts?.message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => close(false)}>{opts?.cancelText || t("cancel")}</Button>
        <Button
          onClick={() => close(true)}
          variant="contained"
          color={opts?.danger ? "error" : "primary"}
        >
          {opts?.confirmText || t("ok")}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { confirm, dialog };
}

