import React from "react";
import { Paper, Typography } from "@mui/material";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PIE_COLORS } from "./chartColors";

type Slice = { id: number; name: string; value: number };

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
  return (
    <Paper sx={{ p: 2, height: 340 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie dataKey="value" nameKey="name" data={chartData} outerRadius={110} label>
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Paper>
  );
}
