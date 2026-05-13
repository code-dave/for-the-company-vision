import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCcw, Save } from "lucide-react";
import { api } from "../api";
import type { AppConfig, HealthResponse, UpdateAppConfig } from "../types";

type Props = {
  onSaved: (config: AppConfig) => void | Promise<void>;
};

type FormState = UpdateAppConfig;

export function SetupPanel({ onSaved }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [form, setForm] = useState<FormState>({
    jiraBaseUrl: "",
    jiraProject: "",
    jiraToken: "",
    codexBin: "codex",
    codexModel: "",
    port: 8787,
    cacheDir: ".vision-cache"
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const [nextConfig, nextHealth] = await Promise.all([api.config(), api.health()]);
      setConfig(nextConfig);
      setHealth(nextHealth);
      setForm({
        jiraBaseUrl: nextConfig.jiraBaseUrl,
        jiraProject: nextConfig.jiraProject,
        jiraToken: "",
        codexBin: nextConfig.codexBin || "codex",
        codexModel: nextConfig.codexModel || "",
        port: nextConfig.port || 8787,
        cacheDir: nextConfig.cacheDir
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveConfig() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.saveConfig(form);
      const nextHealth = await api.health();
      setConfig(saved);
      setHealth(nextHealth);
      setForm((current) => ({ ...current, jiraToken: "" }));
      setMessage("Settings saved. New sync and analysis requests will use this configuration.");
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel setup-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Setup</h2>
        </div>
        <button type="button" className="icon-button secondary" onClick={() => void loadConfig()} disabled={saving}>
          <RefreshCcw size={17} aria-hidden="true" />
          <span>Check</span>
        </button>
      </div>

      <div className="readiness-grid">
        <ReadinessItem ready={Boolean(health?.jiraConfigured)} title="Jira" detail={health?.jiraConfigured ? "Endpoint and token are configured" : "Endpoint or token is missing"} />
        <ReadinessItem ready={Boolean(config?.jiraTokenSaved)} title="Token" detail={config?.jiraTokenSaved ? "A token is saved in local app config" : "Paste a token and save settings"} />
        <ReadinessItem ready={Boolean(health?.codexConfigured)} title="Codex" detail={health?.codexConfigured ? `${health?.codexBin || "codex"} is available` : "Codex CLI is not available on PATH"} />
        <ReadinessItem ready={Boolean(health?.defaultProject)} title="Project" detail={health?.defaultProject || "No default project configured"} />
      </div>

      {error ? <div className="form-message error">{error}</div> : null}
      {message ? (
        <div className="form-message success">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="form-grid">
        <label>
          Jira Endpoint
          <input value={form.jiraBaseUrl} onChange={(event) => setForm({ ...form, jiraBaseUrl: event.target.value })} />
        </label>
        <label>
          Default Project
          <input value={form.jiraProject} onChange={(event) => setForm({ ...form, jiraProject: event.target.value.toUpperCase() })} />
        </label>
        <label>
          API Token
          <input
            type="password"
            value={form.jiraToken}
            placeholder={config?.jiraTokenSaved ? "Leave blank to keep saved token" : "Paste Jira token"}
            onChange={(event) => setForm({ ...form, jiraToken: event.target.value })}
          />
        </label>
        <label>
          Codex Binary
          <input value={form.codexBin} onChange={(event) => setForm({ ...form, codexBin: event.target.value })} />
        </label>
        <label>
          Codex Model
          <input value={form.codexModel} placeholder="Use Codex default" onChange={(event) => setForm({ ...form, codexModel: event.target.value })} />
        </label>
        <label>
          Backend Port
          <input
            type="number"
            min="1"
            max="65535"
            value={form.port}
            onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
          />
        </label>
        <label className="wide-field">
          Cache Directory
          <input value={form.cacheDir} onChange={(event) => setForm({ ...form, cacheDir: event.target.value })} />
        </label>
      </div>

      <div className="setup-footer">
        <div>
          <span>Config file</span>
          <strong>{config?.configPath ?? "Not written yet"}</strong>
        </div>
        <button type="button" className="icon-button primary" onClick={() => void saveConfig()} disabled={saving}>
          <Save size={17} aria-hidden="true" />
          <span>{saving ? "Saving" : "Save"}</span>
        </button>
      </div>
    </section>
  );
}

function ReadinessItem({ ready, title, detail }: { ready: boolean; title: string; detail: string }) {
  return (
    <div className={`readiness-item ${ready ? "ready" : "blocked"}`}>
      <span aria-hidden="true">{ready ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error";
}
