import React, { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { useConfirm } from "../hooks/useConfirm";
import { useAuth } from "../auth/AuthContext";

type TagWithUsage = { id: number; name: string; used_count?: number };

export function TagsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const { me } = useAuth();
  const [items, setItems] = useState<TagWithUsage[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TagWithUsage | null>(null);
  const [name, setName] = useState("");

  async function load() {
    const res = await api.get("/tags");
    setItems(res.data as TagWithUsage[]);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setOpen(true);
  }

  function openEdit(x: TagWithUsage) {
    setEditing(x);
    setName(x.name);
    setOpen(true);
  }

  async function save() {
    if (editing) {
      await api.patch(`/tags/${editing.id}`, { name });
    } else {
      await api.post("/tags", { name });
    }
    setOpen(false);
    await load();
  }

  async function del(id: number) {
    const ok = await confirm({ message: t("confirmDeleteTag"), danger: true });
    if (!ok) return;
    await api.delete(`/tags/${id}`);
    await load();
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t("tags")}
          </Typography>
          <Button variant="contained" onClick={openCreate}>
            {t("create")}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t("tags")}</TableCell>
              <TableCell>{t("used")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((x) => (
              <TableRow key={x.id}>
                <TableCell>
                  <Button
                    size="small"
                    onClick={(e) => {
                      const base = me?.is_admin && !e.altKey ? "/admin/transactions" : "/transactions";
                      navigate(`${base}?tagId=${x.id}`);
                    }}
                  >
                    {x.name}
                  </Button>
                </TableCell>
                <TableCell>{x.used_count ?? 0}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(x)}>
                    {t("edit")}
                  </Button>
                  <Button size="small" color="error" onClick={() => del(x.id)}>
                    {t("delete")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t("edit") : t("create")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={save} variant="contained">
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </Stack>
  );
}
