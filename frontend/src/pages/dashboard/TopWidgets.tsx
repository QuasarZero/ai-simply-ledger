import { Grid, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import dayjs from "../../dayjs";
import type { DashboardData } from "../DashboardPage";

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
                {format === "count" ? String(Math.round(r.value)) : r.value.toFixed(2)}
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
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {t("top10ExpenseTx")}
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("occurredAt")}</TableCell>
            <TableCell align="right">Amount (Base)</TableCell>
            <TableCell>{t("categories")}</TableCell>
            <TableCell>{t("tags")}</TableCell>
            <TableCell>{t("note")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(data?.top_expense_transactions ?? []).map((x) => (
            <TableRow key={x.id}>
              <TableCell>{dayjs(x.occurred_at).format("YYYY-MM-DD")}</TableCell>
              <TableCell align="right">{x.amount_base.toFixed(2)}</TableCell>
              <TableCell>{(x.categories || []).join(", ")}</TableCell>
              <TableCell>{(x.tags || []).join(", ")}</TableCell>
              <TableCell sx={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {x.note || ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
