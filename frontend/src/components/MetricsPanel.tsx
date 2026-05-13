import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Layers3, ListChecks, Target, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { toChartData } from "../lib/format";
import type { BoardAnalysis } from "../types";

type Props = {
  analysis: BoardAnalysis;
};

export function MetricsPanel({ analysis }: Props) {
  const statusData = toChartData(analysis.metrics.statusCounts);

  return (
    <section className="panel metrics-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Portfolio metrics</p>
          <h2>Work shape</h2>
        </div>
      </div>
      <div className="metric-tiles">
        <Metric icon={<Target size={18} />} label="Big rocks" value={analysis.metrics.bigRockCount} />
        <Metric icon={<Layers3 size={18} />} label="Small rocks" value={analysis.metrics.smallRockCount} />
        <Metric icon={<TriangleAlert size={18} />} label="Outliers" value={analysis.metrics.outlierCount} />
        <Metric icon={<ListChecks size={18} />} label="Analyzed" value={analysis.metrics.analyzedIssues} />
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={statusData} margin={{ left: -18, right: 12, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d7dde5" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={64} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip cursor={{ fill: "#eef2f6" }} />
            <Bar dataKey="value" fill="#376996" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="metric-tile">
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
