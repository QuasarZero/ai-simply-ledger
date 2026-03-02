import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { emitToast } from "../components/toastBus";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!token) return false;
    if (!password || !password2) return false;
    if (password !== password2) return false;
    return true;
  }, [token, password, password2]);

  useEffect(() => {
    document.title = `${t("resetPasswordEmailTitle")} | ${t("appTitle")}`;
  }, [t]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError(t("tokenMissing"));
      return;
    }
    if (password !== password2) {
      setError(t("passwordMismatch"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      emitToast({ severity: "success", message: t("resetPasswordSuccess") });
      navigate("/login", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || t("resetPasswordFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 10 }}>
      <Paper sx={{ p: 4 }}>
        <Stack spacing={2}>
          <Typography variant="h5">{t("resetPasswordEmailTitle")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("resetPasswordEmailDesc")}
          </Typography>
          {!token ? <Alert severity="error">{t("tokenMissing")}</Alert> : null}
          {error ? <Alert severity="error">{String(error)}</Alert> : null}
          <Box component="form" onSubmit={submit}>
            <Stack spacing={2}>
              <TextField
                label={t("newPassword")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!token}
              />
              <TextField
                label={t("newPassword2")}
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                disabled={!token}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => navigate("/login", { replace: true })}
                >
                  {t("backToLogin")}
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                <Button type="submit" variant="contained" disabled={!canSubmit || loading}>
                  {t("resetPasswordSubmit")}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}

