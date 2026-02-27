import React from "react";
import { Grid } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { DashboardData } from "../DashboardPage";
import PieCard from "./PieCard";
import { CategoryTopTables } from "./TopWidgets";

export default function CategoriesTab({ data }: { data: DashboardData | null }) {
  const { t } = useTranslation();
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <PieCard
          title={t("categoryShareAmount")}
          data={data?.category_pie_amount ?? []}
          transformName={(name) => {
            if (name === "Uncategorized") return t("uncategorized");
            if (name === "Other") return t("other");
            return name;
          }}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <PieCard
          title={t("categoryShareCount")}
          data={data?.category_pie_count ?? []}
          transformName={(name) => {
            if (name === "Uncategorized") return t("uncategorized");
            if (name === "Other") return t("other");
            return name;
          }}
        />
      </Grid>

      <Grid item xs={12}>
        <CategoryTopTables data={data} />
      </Grid>
    </Grid>
  );
}
