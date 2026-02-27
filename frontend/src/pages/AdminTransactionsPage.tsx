import { useEffect, useMemo, useState } from "react";
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
  TableContainer,
  TableHead,
  TableSortLabel,
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
  categories: Category[];
  tags: Tag[];
};

type SortDir = "asc" | "desc";
type SortKey = "user" | "occurred_at" | "type" | "amount" | "currency" | "categories" | "tags" | "note";

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const r = cmp(a.v, b.v);
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.v);
}

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
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "income">("all");
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
  const [sortKey, setSortKey] = useState<SortKey>("occurred_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const userLabelById = useMemo(() => {
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
    if (typeFilter !== "all") p.type = typeFilter;
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

  function applyLinkedCategory(nextId: number) {
    setLinkCategoryId(nextId);
    const next = new URLSearchParams(searchParams);
    next.set("categoryId", String(nextId));
    setSearchParams(next);
    setSelectedIds(new Set());
    const p = buildParams();
    p.category_id = nextId;
    setAppliedParams(p);
  }

  function applyLinkedTag(nextId: number) {
    setLinkTagId(nextId);
    const next = new URLSearchParams(searchParams);
    next.set("tagId", String(nextId));
    setSearchParams(next);
    setSelectedIds(new Set());
    const p = buildParams();
    p.tag_id = nextId;
    setAppliedParams(p);
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

  function requestSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "occurred_at" || nextKey === "amount" ? "desc" : "asc");
  }

  const sortedItems = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return stableSort(items, (a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "user":
          va = a.user ? `${a.user.username} (${a.user.email})` : userLabelById.get(a.user_id) ?? `#${a.user_id}`;
          vb = b.user ? `${b.user.username} (${b.user.email})` : userLabelById.get(b.user_id) ?? `#${b.user_id}`;
          break;
        case "occurred_at":
          va = a.occurred_at;
          vb = b.occurred_at;
          break;
        case "type":
          va = a.type;
          vb = b.type;
          break;
        case "amount":
          va = a.amount;
          vb = b.amount;
          break;
        case "currency":
          va = a.currency;
          vb = b.currency;
          break;
        case "categories":
          va = (a.categories || []).map((c) => c.name).join(", ");
          vb = (b.categories || []).map((c) => c.name).join(", ");
          break;
        case "tags":
          va = (a.tags || []).map((x) => x.name).join(", ");
          vb = (b.tags || []).map((x) => x.name).join(", ");
          break;
        case "note":
          va = a.note || "";
          vb = b.note || "";
          break;
      }
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [items, sortDir, sortKey, userLabelById]);

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
            <TextField
              select
              label={t("type")}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              size="small"
              sx={{ width: 160 }}
            >
              <MenuItem value="all">{t("all")}</MenuItem>
              <MenuItem value="expense">{t("expense")}</MenuItem>
              <MenuItem value="income">{t("income")}</MenuItem>
            </TextField>
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
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ tableLayout: "fixed" }}>
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
                <TableCell sx={{ width: 300 }} sortDirection={sortKey === "user" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "user"}
                    direction={sortKey === "user" ? sortDir : "asc"}
                    onClick={() => requestSort("user")}
                  >
                    {t("user")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 110 }} sortDirection={sortKey === "occurred_at" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "occurred_at"}
                    direction={sortKey === "occurred_at" ? sortDir : "asc"}
                    onClick={() => requestSort("occurred_at")}
                  >
                    {t("occurredAt")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 80 }} sortDirection={sortKey === "type" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "type"}
                    direction={sortKey === "type" ? sortDir : "asc"}
                    onClick={() => requestSort("type")}
                  >
                    {t("type")}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ width: 100 }} sortDirection={sortKey === "amount" ? sortDir : false}>
                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <TableSortLabel
                      active={sortKey === "amount"}
                      direction={sortKey === "amount" ? sortDir : "asc"}
                      onClick={() => requestSort("amount")}
                    >
                      {t("amount")}
                    </TableSortLabel>
                  </Box>
                </TableCell>
                <TableCell sx={{ width: 80 }} sortDirection={sortKey === "currency" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "currency"}
                    direction={sortKey === "currency" ? sortDir : "asc"}
                    onClick={() => requestSort("currency")}
                  >
                    {t("currency")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 150 }} sortDirection={sortKey === "categories" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "categories"}
                    direction={sortKey === "categories" ? sortDir : "asc"}
                    onClick={() => requestSort("categories")}
                  >
                    {t("categories")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 400 }} sortDirection={sortKey === "tags" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "tags"}
                    direction={sortKey === "tags" ? sortDir : "asc"}
                    onClick={() => requestSort("tags")}
                  >
                    {t("tags")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 400 }} sortDirection={sortKey === "note" ? sortDir : false}>
                  <TableSortLabel
                    active={sortKey === "note"}
                    direction={sortKey === "note" ? sortDir : "asc"}
                    onClick={() => requestSort("note")}
                  >
                    {t("note")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{width: 120}}>{t("actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.map((it) => (
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
                  <TableCell>
                    <Typography
                      component="span"
                      sx={{ color: it.type === "income" ? "#2e7d32" : "#d32f2f", fontSize: "13px" }}
                    >
                      {it.type === "income" ? t("income") : t("expense")}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{it.amount.toFixed(2)}</TableCell>
                  <TableCell align="left">{it.currency}</TableCell>
                  <TableCell>
                    {(it.categories || []).map((c) => (
                      <Chip
                        key={c.id}
                        label={c.name}
                        size="small"
                        clickable
                        onClick={() => applyLinkedCategory(c.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </TableCell>
                  <TableCell>
                    {(it.tags || []).map((x) => (
                      <Chip
                        key={x.id}
                        label={x.name}
                        size="small"
                        clickable
                        onClick={() => applyLinkedTag(x.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.note || ""}
                  </TableCell>
                  <TableCell align="left">
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
        </TableContainer>
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
