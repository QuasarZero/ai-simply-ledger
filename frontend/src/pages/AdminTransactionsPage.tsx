import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  Divider,
  Paper,
  FormControlLabel,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Menu,
  MenuItem,
  TextField,
  Typography
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import { api } from "../api/client";
import dayjs from "../dayjs";
import { DateRangePresets } from "../components/DateRangePresets";
import { usePersistedDateRange } from "../hooks/usePersistedDateRange";
import { useConfirm } from "../hooks/useConfirm";

type Tx = {
  id: number;
  user_id: number;
  user?: { id: number; email: string; username: string } | null;
  type: "income" | "expense";
  amount: number;
  currency: string;
  occurred_at: string;
  note?: string | null;
  is_voided: boolean;
};

type Category = { id: number; name: string };
type Tag = { id: number; name: string };
type User = { id: number; email: string; username: string };

export function AdminTransactionsPage() {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Tx[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const { preset, setPreset, start, setStart, end, setEnd } = usePersistedDateRange(
    "dateRange:adminTransactions",
    30
  );
  const [voided, setVoided] = useState(false);
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [linkUserId, setLinkUserId] = useState<number | null>(() => {
    const v = searchParams.get("userId");
    return v && !Number.isNaN(Number(v)) ? Number(v) : null;
  });
  const [linkCategoryId, setLinkCategoryId] = useState<number | null>(() => {
    const v = searchParams.get("categoryId");
    return v && !Number.isNaN(Number(v)) ? Number(v) : null;
  });
  const [linkTagId, setLinkTagId] = useState<number | null>(() => {
    const v = searchParams.get("tagId");
    return v && !Number.isNaN(Number(v)) ? Number(v) : null;
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [appliedParams, setAppliedParams] = useState<Record<string, any> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actionsAnchorEl, setActionsAnchorEl] = useState<HTMLElement | null>(null);
  const [actionsTx, setActionsTx] = useState<Tx | null>(null);

  useEffect(() => {
    const key = "filter:adminTransactions:voided";
    const saved = localStorage.getItem(key);
    if (saved === "true") setVoided(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("filter:adminTransactions:voided", voided ? "true" : "false");
  }, [voided]);

  useEffect(() => {
    Promise.all([api.get("/categories"), api.get("/tags"), api.get("/admin/users")])
      .then(([c, tg, u]) => {
        setCategories((c.data || []) as Category[]);
        setTags((tg.data || []) as Tag[]);
        setUsers((u.data || []) as User[]);
      })
      .catch(() => {});
  }, []);

  const userLabelById = React.useMemo(() => {
    const map = new Map<number, string>();
    users.forEach((u) => map.set(u.id, `${u.username} (${u.email})`));
    return map;
  }, [users]);

  function buildParams() {
    const p: Record<string, any> = {
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      user_id: linkUserId ?? undefined,
      voided: voided ? true : undefined
    };
    const min = minAmount.trim();
    const max = maxAmount.trim();
    if (min !== "" && !Number.isNaN(Number(min))) p.min_amount = Number(min);
    if (max !== "" && !Number.isNaN(Number(max))) p.max_amount = Number(max);
    if (linkCategoryId) p.category_id = linkCategoryId;
    if (linkTagId) p.tag_id = linkTagId;
    return p;
  }

  function applyFilters() {
    setSelectedIds(new Set());
    setAppliedParams(buildParams());
  }

  async function load(params: Record<string, any>) {
    const res = await api.get("/admin/transactions", { params });
    setItems((res.data.items || []) as Tx[]);
  }

  useEffect(() => {
    if (!appliedParams) return;
    load(appliedParams).catch(() => {});
  }, [appliedParams]);

  useEffect(() => {
    setAppliedParams(buildParams());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openActionsMenu(e: React.MouseEvent<HTMLElement>, tx: Tx) {
    setActionsAnchorEl(e.currentTarget);
    setActionsTx(tx);
  }

  function closeActionsMenu() {
    setActionsAnchorEl(null);
    setActionsTx(null);
  }

  async function del(txId: number) {
    const ok = await confirm({ message: t("confirmDeleteTx"), danger: true });
    if (!ok) return;
    await api.delete(`/admin/transactions/${txId}`);
    if (appliedParams) await load(appliedParams);
  }

  async function toggleVoided(tx: Tx) {
    const ok = await confirm({
      message: tx.is_voided ? t("confirmRestoreTx") : t("confirmVoidTx"),
      danger: !tx.is_voided
    });
    if (!ok) return;
    await api.patch(`/admin/transactions/${tx.id}`, { is_voided: !tx.is_voided });
    if (appliedParams) await load(appliedParams);
  }

  async function bulk(action: "void" | "restore" | "delete") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm({
      message:
        action === "delete"
          ? t("confirmBulkDelete")
          : action === "void"
            ? t("confirmBulkVoid")
            : t("confirmBulkRestore"),
      danger: action !== "restore"
    });
    if (!ok) return;
    await api.post("/admin/transactions/bulk", { ids, action });
    setSelectedIds(new Set());
    if (appliedParams) await load(appliedParams);
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <DateRangePresets
              value={preset}
              onChange={setPreset}
              setStart={(d) => setStart(d)}
              setEnd={(d) => setEnd(d)}
            />
            <DatePicker
              label={t("startDate")}
              value={start}
              onChange={(v) => {
                if (!v) return;
                setPreset("custom");
                setStart(v);
              }}
            />
            <DatePicker
              label={t("endDate")}
              value={end}
              onChange={(v) => {
                if (!v) return;
                setPreset("custom");
                setEnd(v);
              }}
            />
            <FormControlLabel
              control={<Checkbox checked={voided} onChange={(e) => setVoided(e.target.checked)} />}
              label={t("voided")}
            />
            {linkUserId ? (
              <Chip
                color="info"
                variant="outlined"
                label={`${t("user")}: ${userLabelById.get(linkUserId) ?? `#${linkUserId}`}`}
                onDelete={() => {
                  setLinkUserId(null);
                  const next = new URLSearchParams(searchParams);
                  next.delete("userId");
                  setSearchParams(next);
                }}
              />
            ) : null}
            {linkCategoryId ? (
              <Chip
                color="primary"
                variant="outlined"
              label={`${t("linkedCategory")}: ${
                categories.find((c) => c.id === linkCategoryId)?.name ?? `#${linkCategoryId}`
              }`}
              onDelete={() => {
                setLinkCategoryId(null);
                const next = new URLSearchParams(searchParams);
                next.delete("categoryId");
                setSearchParams(next);
              }}
            />
          ) : null}
          {linkTagId ? (
            <Chip
              color="secondary"
              variant="outlined"
              label={`${t("linkedTag")}: ${tags.find((x) => x.id === linkTagId)?.name ?? `#${linkTagId}`}`}
              onDelete={() => {
                setLinkTagId(null);
                const next = new URLSearchParams(searchParams);
                next.delete("tagId");
                setSearchParams(next);
              }}
            />
          ) : null}
          <TextField
            label={t("minAmount")}
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            size="small"
            sx={{ width: 140 }}
          />
          <TextField
            label={t("maxAmount")}
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            size="small"
            sx={{ width: 140 }}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" type="submit">
            {t("apply")}
          </Button>
          </Stack>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t("adminTransactions")}
          </Typography>
          {selectedIds.size > 0 ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">
                {t("selected")}: {selectedIds.size}
              </Typography>
              <Button size="small" onClick={() => bulk("void")}>
                {t("void")}
              </Button>
              <Button size="small" onClick={() => bulk("restore")}>
                {t("restore")}
              </Button>
              <Button size="small" color="error" onClick={() => bulk("delete")}>
                {t("delete")}
              </Button>
            </Stack>
          ) : null}
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={items.length > 0 && items.every((x) => selectedIds.has(x.id))}
                  indeterminate={
                    selectedIds.size > 0 &&
                    items.some((x) => selectedIds.has(x.id)) &&
                    !items.every((x) => selectedIds.has(x.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(items.map((x) => x.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </TableCell>
              <TableCell>User</TableCell>
              <TableCell>{t("occurredAt")}</TableCell>
              <TableCell>{t("type")}</TableCell>
              <TableCell>{t("amount")}</TableCell>
              <TableCell>{t("currency")}</TableCell>
              <TableCell>{t("note")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.has(it.id)}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(it.id);
                        else next.delete(it.id);
                        return next;
                      });
                    }}
                  />
                </TableCell>
                <TableCell>
                  {it.user
                    ? `${it.user.username} (${it.user.email})`
                    : userLabelById.get(it.user_id) ?? `#${it.user_id}`}
                </TableCell>
                <TableCell>{dayjs(it.occurred_at).format("YYYY-MM-DD")}</TableCell>
                <TableCell>{it.type === "income" ? t("income") : t("expense")}</TableCell>
                <TableCell>{it.amount.toFixed(2)}</TableCell>
                <TableCell>{it.currency}</TableCell>
                <TableCell sx={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {it.note || ""}
                </TableCell>
                <TableCell align="right">
                  <ButtonGroup variant="outlined" size="small">
                    <Button onClick={() => toggleVoided(it)}>{it.is_voided ? t("restore") : t("void")}</Button>
                    <Button onClick={(e) => openActionsMenu(e, it)} sx={{ px: 0.5, minWidth: 36 }}>
                      <ArrowDropDownIcon fontSize="small" />
                    </Button>
                  </ButtonGroup>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Menu
        anchorEl={actionsAnchorEl}
        open={!!actionsAnchorEl}
        onClose={closeActionsMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Divider />
        <MenuItem
          onClick={() => {
            if (!actionsTx) return;
            const id = actionsTx.id;
            closeActionsMenu();
            del(id);
          }}
        >
          {t("delete")}
        </MenuItem>
      </Menu>
      {dialog}
    </Stack>
  );
}
