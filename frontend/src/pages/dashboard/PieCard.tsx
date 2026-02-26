import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PIE_COLORS } from "./chartColors";

type Slice = { id: number; name: string; value: number };

const RADIAN = Math.PI / 180;

function renderInnerLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  value
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  value?: number;
}) {
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    innerRadius == null ||
    outerRadius == null ||
    percent == null ||
    value == null
  )
    return null;

  // Hide labels for tiny slices to avoid clutter.
  if (percent < 0.06) return null;

  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const text = Number.isInteger(value) ? String(value) : `${Math.round(percent * 100)}%`;

  return (
    <text x={x} y={y} fill="currentColor" textAnchor="middle" dominantBaseline="central">
      {text}
    </text>
  );
}

export default function PieCard({
  title,
  data,
  transformName
}: {
  title: string;
  data: Slice[];
  transformName?: (name: string) => string;
}) {
  const chartData = (data || []).map((d) => ({
    ...d,
    name: transformName ? transformName(d.name) : d.name
  }));

  const legendItems = chartData.map((d, idx) => ({
    name: d.name,
    color: PIE_COLORS[idx % PIE_COLORS.length]
  }));

  return (
    <Paper sx={{ p: 2, height: 340, display: "flex", flexDirection: "column" }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              dataKey="value"
              nameKey="name"
              data={chartData}
              outerRadius={104}
              labelLine={false}
              label={renderInnerLabel}
            >
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Box
        sx={{
          mt: 1,
          display: "flex",
          flexWrap: "wrap",
          gap: 1.5,
          maxHeight: 56,
          overflowY: "auto"
        }}
      >
        {legendItems.map((it) => (
          <Box key={it.name} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: it.color, flex: "0 0 auto" }} />
            <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
              {it.name}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
