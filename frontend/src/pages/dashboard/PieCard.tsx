import * as React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { PIE_COLORS } from "./chartColors";
import { formatMoney } from "../../formatMoney";

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

function renderActiveSlice(props: any) {
  const {
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    value
  } = props;

  const offset = 10;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const dx = cos * offset;
  const dy = sin * offset;

  return (
    <g>
      <Sector
        cx={cx + dx}
        cy={cy + dy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
      />
      {renderInnerLabel({
        cx: cx + dx,
        cy: cy + dy,
        midAngle,
        innerRadius,
        outerRadius: outerRadius + 6,
        percent,
        value
      })}
      {/* keep tooltip-friendly semantics */}
      <title>
        {payload?.name}: {Number.isInteger(value) ? String(value) : formatMoney(Number(value))}
      </title>
    </g>
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
  const [hoverId, setHoverId] = React.useState<number | null>(null);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = React.useState<number[]>([]);

  const chartData = (data || []).map((d) => ({
    ...d,
    name: transformName ? transformName(d.name) : d.name
  }));

  const colorById = React.useMemo(() => {
    const map = new Map<number, string>();
    chartData.forEach((d, idx) => {
      map.set(d.id, PIE_COLORS[idx % PIE_COLORS.length]);
    });
    return map;
  }, [chartData]);

  const legendItems = React.useMemo(
    () =>
      chartData.map((d) => ({
        id: d.id,
        name: d.name,
        color: colorById.get(d.id) ?? PIE_COLORS[0]
      })),
    [chartData, colorById]
  );

  const visibleData = React.useMemo(
    () => chartData.filter((d) => !hiddenIds.includes(d.id)),
    [chartData, hiddenIds]
  );

  React.useEffect(() => {
    if (activeId != null && hiddenIds.includes(activeId)) setActiveId(null);
    if (hoverId != null && hiddenIds.includes(hoverId)) setHoverId(null);
  }, [activeId, hiddenIds, hoverId]);

  const activeIndex = React.useMemo(() => {
    if (activeId == null) return -1;
    return visibleData.findIndex((d) => d.id === activeId);
  }, [activeId, visibleData]);

  const labelRenderer = React.useCallback(
    (props: any) => {
      // The active slice's label is rendered by `activeShape` (so it moves with the slice).
      // Prevent the default label from rendering twice.
      if (activeId != null && props?.payload?.id === activeId) return null;
      return renderInnerLabel(props);
    },
    [activeId]
  );

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
              data={visibleData}
              outerRadius={104}
              labelLine={false}
              label={labelRenderer}
              activeIndex={activeIndex}
              activeShape={renderActiveSlice}
              onMouseLeave={() => setHoverId(null)}
              onMouseEnter={(_, index) => {
                const item = visibleData[index];
                if (item) setHoverId(item.id);
              }}
              onClick={(_, index) => {
                const item = visibleData[index];
                if (!item) return;
                setActiveId((prev) => (prev === item.id ? null : item.id));
              }}
            >
              {visibleData.map((d) => {
                const focusId = hoverId ?? activeId;
                const isFocused = focusId != null && d.id === focusId;
                const shouldDim = focusId != null && d.id !== focusId;
                return (
                  <Cell
                    key={d.id}
                    fill={colorById.get(d.id) ?? PIE_COLORS[0]}
                    opacity={shouldDim ? 0.25 : 1}
                    stroke={isFocused ? "#fff" : "transparent"}
                    strokeWidth={isFocused ? 2 : 1}
                  />
                );
              })}
            </Pie>
            <Tooltip formatter={(v: any) => (Number.isInteger(Number(v)) ? String(Math.round(Number(v))) : formatMoney(Number(v)))} />
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
        {legendItems.map((it) => {
          const isHidden = hiddenIds.includes(it.id);
          return (
          <Box
            key={it.id}
            onMouseEnter={() => setHoverId(isHidden ? null : it.id)}
            onMouseLeave={() => setHoverId(null)}
            onClick={() =>
              setHiddenIds((prev) => (prev.includes(it.id) ? prev.filter((x) => x !== it.id) : [...prev, it.id]))
            }
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              cursor: "pointer",
              userSelect: "none",
              opacity: isHidden ? 0.4 : 1,
              textDecoration: isHidden ? "line-through" : "none"
            }}
          >
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: it.color, flex: "0 0 auto" }} />
            <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
              {it.name}
            </Typography>
          </Box>
        );
        })}
      </Box>
    </Paper>
  );
}
