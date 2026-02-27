import { useState } from "react";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function ProfilePage() {
  const { t } = useTranslation();
  const { me, refreshMe } = useAuth();

  const [email, setEmail] = useState(me?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mismatch = newPassword.length > 0 && newPassword2.length > 0 && newPassword !== newPassword2;

  async function save() {
    setMsg(null);
    setErr(null);
    if (mismatch) {
      setErr(t("passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      await api.patch("/me", {
        email: email || null,
        current_password: currentPassword,
        new_password: newPassword || null
      });
      setMsg(t("saved"));
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      await refreshMe();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">{t("profile")}</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          {t("username")}: {me?.username}
        </Typography>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          {msg ? <Alert severity="success">{msg}</Alert> : null}
          {err ? <Alert severity="error">{err}</Alert> : null}
          <TextField label={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            label={t("currentPassword")}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <TextField
            label={t("newPassword")}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <TextField
            label={t("newPassword2")}
            type="password"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
            error={mismatch}
            helperText={mismatch ? t("passwordMismatch") : ""}
          />
          <Button variant="contained" onClick={save} disabled={saving || !currentPassword || mismatch}>
            {t("save")}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
