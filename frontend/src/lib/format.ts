export function formatDate(value?: string): string {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function toChartData(counts: Record<string, number> | Array<{ name: string; value: number }> = {}) {
  if (Array.isArray(counts)) {
    return [...counts].sort((a, b) => b.value - a.value).slice(0, 8);
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));
}

export function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}
