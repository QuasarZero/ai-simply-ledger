import React from "react";
import { Grid } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { DashboardData } from "../DashboardPage";
import PieCard from "./PieCard";
import { TagTopTables } from "./TopWidgets";

export default function TagsTab({ data }: { data: DashboardData | null }) {
  const { t } = useTranslation();
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <PieCard
          title={t("tagShareAmount")}
          data={data?.tag_pie_amount ?? []}
          transformName={(name) => {
            if (name === "No Tag") return t("noTag");
            if (name === "Other") return t("other");
            return name;
          }}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <PieCard
          title={t("tagShareCount")}
          data={data?.tag_pie_count ?? []}
          transformName={(name) => {
            if (name === "No Tag") return t("noTag");
            if (name === "Other") return t("other");
            return name;
          }}
        />
      </Grid>

      <Grid item xs={12}>
        <TagTopTables data={data} />
      </Grid>
    </Grid>
  );
}
