import { useEffect, useState } from "react";
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

type Category = { id: number; name: string; description?: string | null };

export function CategoriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const { me } = useAuth();
  const [items, setItems] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function load() {
    const res = await api.get("/categories");
    setItems(res.data as Category[]);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setDescription(c.description || "");
    setOpen(true);
  }

  async function save() {
    if (editing) {
      await api.patch(`/categories/${editing.id}`, { name, description: description || null });
    } else {
      await api.post("/categories", { name, description: description || null });
    }
    setOpen(false);
    await load();
  }

  async function del(id: number) {
    const ok = await confirm({ message: t("confirmDeleteCategory"), danger: true });
    if (!ok) return;
    await api.delete(`/categories/${id}`);
    await load();
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t("categories")}
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
              <TableCell>{t("categories")}</TableCell>
              <TableCell>{t("note")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Button
                    size="small"
                    onClick={(e) => {
                      const base =
                        me?.is_admin && !e.altKey ? "/admin/transactions" : "/transactions";
                      navigate(`${base}?categoryId=${c.id}`);
                    }}
                  >
                    {c.name}
                  </Button>
                </TableCell>
                <TableCell>{c.description || ""}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(c)}>
                    {t("edit")}
                  </Button>
                  <Button size="small" color="error" onClick={() => del(c.id)}>
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
            <TextField label={t("note")} value={description} onChange={(e) => setDescription(e.target.value)} />
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
