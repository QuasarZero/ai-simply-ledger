import { Chip, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import dayjs from "../../dayjs";
import { formatMoney } from "../../formatMoney";
import type { DashboardData } from "../DashboardPage";
import { useAuth } from "../../auth/AuthContext";

export function TopTable({
  title,
  rows,
  format
}: {
  title: string;
  rows: { name: string; value: number }[];
  format?: "money" | "count";
}) {
  const { t } = useTranslation();
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("name")}</TableCell>
            <TableCell align="right">{t("value")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(rows || []).map((r, idx) => (
            <TableRow key={idx}>
              <TableCell>{r.name}</TableCell>
              <TableCell align="right">
                {format === "count" ? String(Math.round(r.value)) : formatMoney(r.value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

export function Top10ExpenseTransactions({ data }: { data: DashboardData | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useAuth();
  const requestedUserId = data?.requested_user_id ?? null;

  function goCategory(categoryId: number) {
    if (categoryId <= 0) return;
    const p = new URLSearchParams();
    p.set("categoryId", String(categoryId));
    if (me?.is_admin && requestedUserId && requestedUserId > 0) p.set("userId", String(requestedUserId));
    const base = me?.is_admin ? "/admin/transactions" : "/transactions";
    navigate(`${base}?${p.toString()}`);
  }

  function goTag(tagId: number) {
    if (tagId <= 0) return;
    const p = new URLSearchParams();
    p.set("tagId", String(tagId));
    if (me?.is_admin && requestedUserId && requestedUserId > 0) p.set("userId", String(requestedUserId));
    const base = me?.is_admin ? "/admin/transactions" : "/transactions";
    navigate(`${base}?${p.toString()}`);
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {t("top10ExpenseTx")}
      </Typography>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ tableLayout: "fixed" }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{width: 110}}>{t("occurredAt")}</TableCell>
              <TableCell align="right" sx={{width: 100}}>{t("amount")}</TableCell>
              <TableCell sx={{width: 80}}>{t("currency")}</TableCell>
              <TableCell sx={{width: 150}}>{t("categories")}</TableCell>
              <TableCell sx={{width: 400}}>{t("tags")}</TableCell>
              <TableCell sx={{width: 400}}>{t("note")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.top_expense_transactions ?? []).map((x) => (
                <TableRow key={x.id}>
                  <TableCell>{dayjs(x.occurred_at).format("YYYY-MM-DD")}</TableCell>
                <TableCell align="right">-{formatMoney(x.amount_base)}</TableCell>
                <TableCell>{x.currency}</TableCell>
                <TableCell>
                  <Stack direction="row" flexWrap="wrap" useFlexGap>
                    {(x.categories || []).map((c) => (
                      <Chip
                        key={c.id}
                        label={c.name}
                        size="small"
                        clickable={c.id > 0}
                        onClick={() => goCategory(c.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" flexWrap="wrap" useFlexGap>
                    {(x.tags || []).map((tg) => (
                      <Chip
                        key={tg.id}
                        label={tg.name}
                        size="small"
                        clickable={tg.id > 0}
                        onClick={() => goTag(tg.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell sx={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {x.note || ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export function Top10IncomeTransactions({ data }: { data: DashboardData | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useAuth();
  const requestedUserId = data?.requested_user_id ?? null;

  function goCategory(categoryId: number) {
    if (categoryId <= 0) return;
    const p = new URLSearchParams();
    p.set("categoryId", String(categoryId));
    if (me?.is_admin && requestedUserId && requestedUserId > 0) p.set("userId", String(requestedUserId));
    const base = me?.is_admin ? "/admin/transactions" : "/transactions";
    navigate(`${base}?${p.toString()}`);
  }

  function goTag(tagId: number) {
    if (tagId <= 0) return;
    const p = new URLSearchParams();
    p.set("tagId", String(tagId));
    if (me?.is_admin && requestedUserId && requestedUserId > 0) p.set("userId", String(requestedUserId));
    const base = me?.is_admin ? "/admin/transactions" : "/transactions";
    navigate(`${base}?${p.toString()}`);
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {t("top10IncomeTx")}
      </Typography>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ tableLayout: "fixed" }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 110 }}>{t("occurredAt")}</TableCell>
              <TableCell align="right" sx={{ width: 100 }}>
                {t("amount")}
              </TableCell>
              <TableCell sx={{ width: 80 }}>{t("currency")}</TableCell>
              <TableCell sx={{ width: 150 }}>{t("categories")}</TableCell>
              <TableCell sx={{ width: 400 }}>{t("tags")}</TableCell>
              <TableCell sx={{ width: 400 }}>{t("note")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.top_income_transactions ?? []).map((x) => (
                <TableRow key={x.id}>
                  <TableCell>{dayjs(x.occurred_at).format("YYYY-MM-DD")}</TableCell>
                <TableCell align="right">+{formatMoney(x.amount_base)}</TableCell>
                <TableCell>{x.currency}</TableCell>
                <TableCell>
                  <Stack direction="row" flexWrap="wrap" useFlexGap>
                    {(x.categories || []).map((c) => (
                      <Chip
                        key={c.id}
                        label={c.name}
                        size="small"
                        clickable={c.id > 0}
                        onClick={() => goCategory(c.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" flexWrap="wrap" useFlexGap>
                    {(x.tags || []).map((tg) => (
                      <Chip
                        key={tg.id}
                        label={tg.name}
                        size="small"
                        clickable={tg.id > 0}
                        onClick={() => goTag(tg.id)}
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell sx={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {x.note || ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export function CategoryTopTables({ data }: { data: DashboardData | null }) {
  const { t } = useTranslation();
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <TopTable
          title={t("topCategoriesExpenseAmount")}
          rows={(data?.top_expense_categories_amount ?? []).map((x) => ({ name: x.name, value: x.value }))}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TopTable
          title={t("topCategoriesCount")}
          rows={(data?.top_categories_count ?? []).map((x) => ({ name: x.name, value: x.value }))}
          format="count"
        />
      </Grid>
    </Grid>
  );
}

export function TagTopTables({ data }: { data: DashboardData | null }) {
  const { t } = useTranslation();
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <TopTable
          title={t("topTagsExpenseAmount")}
          rows={(data?.top_expense_tags_amount ?? []).map((x) => ({ name: x.name, value: x.value }))}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TopTable
          title={t("topTagsCount")}
          rows={(data?.top_tags_count ?? []).map((x) => ({ name: x.name, value: x.value }))}
          format="count"
        />
      </Grid>
    </Grid>
  );
}
