import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { emitToast } from "../components/toastBus";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login, token } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123qaz");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [openForgot, setOpenForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t("loginTitle")} | ${t("appTitle")}`;
  }, [t]);

  useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [token, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitForgot() {
    const email = forgotEmail.trim();
    if (!email) return;
    setForgotError(null);
    setForgotLoading(true);
    try {
      await api.post("/auth/forgot-password", { email, lang: i18n.language }, { meta: { silentToast: true } });
      emitToast({ severity: "success", message: t("resetEmailSent") });
      setOpenForgot(false);
      setForgotEmail("");
    } catch (err: any) {
      setForgotError(err?.response?.data?.detail || err?.message || t("requestFailed"));
    } finally {
      setForgotLoading(false);
    }
  }

  function onForgotKeyDownCapture(e: any) {
    const isEnter = e?.key === "Enter" || e?.code === "Enter" || e?.code === "NumpadEnter";
    if (!isEnter) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (forgotLoading) return;
    if (!forgotEmail.trim()) return;
    e.preventDefault();
    e.stopPropagation();
    submitForgot();
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 10 }}>
      <Paper sx={{ p: 4 }}>
        <Stack spacing={2}>
          <Typography variant="h5">{t("loginTitle")}</Typography>
          {error ? <Alert severity="error">{String(error)}</Alert> : null}
          <Box
            component="form"
            onSubmit={onSubmit}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                onSubmit(e as any);
                return;
              }
              // Only allow Ctrl+Enter to submit on the login page.
              e.preventDefault();
            }}
          >
            <Stack spacing={2}>
              <TextField
                label={t("usernameOrEmail")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
              <TextField
                label={t("password")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" variant="contained" disabled={loading}>
                {t("login")}
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setForgotError(null);
                  setOpenForgot(true);
                }}
              >
                {t("forgotPassword")}
              </Button>
            </Stack>
          </Box>
       </Stack>
      </Paper>

      <Dialog
        open={openForgot}
        onClose={() => (forgotLoading ? null : setOpenForgot(false))}
        onKeyDownCapture={onForgotKeyDownCapture}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("forgotPasswordTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t("forgotPasswordDesc")}
            </Typography>
            {forgotError ? <Alert severity="error">{String(forgotError)}</Alert> : null}
            <TextField
              label={t("email")}
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenForgot(false)} disabled={forgotLoading}>
            {t("cancel")}
          </Button>
          <Button onClick={submitForgot} variant="contained" disabled={forgotLoading || !forgotEmail.trim()}>
            {t("sendResetEmail")}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
