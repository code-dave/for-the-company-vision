import type { AppConfig, BoardAnalysis, HealthResponse, Snapshot, UpdateAppConfig } from "./types";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Keep the HTTP status message.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  config: () => request<AppConfig>("/api/config"),
  saveConfig: (config: UpdateAppConfig) =>
    request<AppConfig>("/api/config", {
      method: "POST",
      body: JSON.stringify(config)
    }),
  sync: (project: string) =>
    request<Snapshot>("/api/sync", {
      method: "POST",
      body: JSON.stringify({ project })
    }),
  snapshot: (project: string) =>
    request<Snapshot>(`/api/snapshot?project=${encodeURIComponent(project)}`),
  analyze: (project: string, forceSync = false) =>
    request<BoardAnalysis>("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ project, forceSync })
    }),
  analysis: (project: string) =>
    request<BoardAnalysis>(`/api/analysis?project=${encodeURIComponent(project)}`)
};
