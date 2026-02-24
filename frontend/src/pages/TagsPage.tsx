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

import { api } from "../api/client";

type Tag = { id: number; name: string };

export function TagsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState("");

  async function load() {
    const res = await api.get("/tags");
    setItems(res.data as Tag[]);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setOpen(true);
  }

  function openEdit(x: Tag) {
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
              <TableCell>ID</TableCell>
              <TableCell>{t("tags")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((x) => (
              <TableRow key={x.id}>
                <TableCell>{x.id}</TableCell>
                <TableCell>{x.name}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(x)}>
                    Edit
                  </Button>
                  <Button size="small" color="error" onClick={() => del(x.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit" : t("create")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={save} variant="contained">
            {t("save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

