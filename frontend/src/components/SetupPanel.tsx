import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCcw, Save } from "lucide-react";
import { api } from "../api";
import type { AppConfig, HealthResponse, UpdateAppConfig } from "../types";

type Props = {
  onSaved: (config: AppConfig) => void | Promise<void>;
};

type FormState = Omit<UpdateAppConfig, "jiraToken"> & { jiraToken: string };
type SetupStep = "endpoint" | "token" | "project" | "codex" | "review";

const steps: Array<{ id: SetupStep; label: string }> = [
  { id: "endpoint", label: "Jira URL" },
  { id: "token", label: "Token" },
  { id: "project", label: "Project" },
  { id: "codex", label: "Codex" },
  { id: "review", label: "Ready" }
];

export function SetupPanel({ onSaved }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [step, setStep] = useState<SetupStep>("endpoint");
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

  const normalizedJiraUrl = useMemo(() => normalizeJiraUrl(form.jiraBaseUrl), [form.jiraBaseUrl]);
  const tokenUrl = useMemo(() => buildTokenUrl(normalizedJiraUrl), [normalizedJiraUrl]);
  const currentStepIndex = steps.findIndex((item) => item.id === step);

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
        cacheDir: nextConfig.cacheDir || ".vision-cache"
      });
      if (!nextConfig.jiraBaseUrl) {
        setStep("endpoint");
      } else if (!nextConfig.jiraTokenSaved) {
        setStep("token");
      } else if (!nextConfig.jiraProject) {
        setStep("project");
      } else {
        setStep("review");
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveConfig() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.saveConfig({
        ...form,
        jiraBaseUrl: normalizedJiraUrl,
        jiraProject: form.jiraProject.trim().toUpperCase(),
        codexBin: form.codexBin.trim() || "codex",
        cacheDir: form.cacheDir.trim() || ".vision-cache"
      });
      const nextHealth = await api.health();
      setConfig(saved);
      setHealth(nextHealth);
      setForm((current) => ({ ...current, jiraBaseUrl: saved.jiraBaseUrl, jiraProject: saved.jiraProject, jiraToken: "" }));
      setMessage("Settings saved. You can now sync Jira and run Codex analysis.");
      await onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function goNext() {
    setError(null);
    if (step === "endpoint") {
      if (!normalizedJiraUrl) {
        setError("Enter a Jira URL.");
        return;
      }
      setForm({ ...form, jiraBaseUrl: normalizedJiraUrl });
      setStep("token");
      return;
    }
    if (step === "token") {
      if (!form.jiraToken.trim() && !config?.jiraTokenSaved) {
        setError("Paste a Jira API token before continuing.");
        return;
      }
      setStep("project");
      return;
    }
    if (step === "project") {
      if (!form.jiraProject.trim()) {
        setError("Enter a Jira project key.");
        return;
      }
      setForm({ ...form, jiraProject: form.jiraProject.trim().toUpperCase() });
      setStep("codex");
      return;
    }
    if (step === "codex") {
      setStep("review");
    }
  }

  function goBack() {
    const previous = steps[Math.max(0, currentStepIndex - 1)];
    setError(null);
    setStep(previous.id);
  }

  return (
    <section className="panel setup-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Onboarding</p>
          <h2>Setup</h2>
        </div>
        <button type="button" className="icon-button secondary" onClick={() => void loadConfig()} disabled={saving}>
          <RefreshCcw size={17} aria-hidden="true" />
          <span>Check</span>
        </button>
      </div>

      <div className="setup-steps" aria-label="Setup steps">
        {steps.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={step === item.id ? "active" : index < currentStepIndex ? "complete" : ""}
            onClick={() => setStep(item.id)}
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="readiness-grid">
        <ReadinessItem ready={Boolean(health?.jiraConfigured)} title="Jira" detail={health?.jiraConfigured ? "Endpoint and token are configured" : "Endpoint or token is missing"} />
        <ReadinessItem ready={Boolean(config?.jiraTokenSaved || form.jiraToken.trim())} title="Token" detail={config?.jiraTokenSaved ? "A token is saved in local app config" : "Token will be saved locally"} />
        <ReadinessItem ready={Boolean(health?.codexConfigured)} title="Codex" detail={health?.codexConfigured ? `${health?.codexBin || "codex"} is available` : "Codex CLI is not available on PATH"} />
        <ReadinessItem ready={Boolean(form.jiraProject.trim() || health?.defaultProject)} title="Project" detail={form.jiraProject.trim().toUpperCase() || health?.defaultProject || "No project configured"} />
      </div>

      {error ? <div className="form-message error">{error}</div> : null}
      {message ? (
        <div className="form-message success">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="setup-card">
        {step === "endpoint" ? (
          <div className="setup-step-panel">
            <div>
              <p className="eyebrow">Step 1</p>
              <h3>Connect Jira</h3>
              <p className="setup-copy">Paste any Jira URL. The app will keep only the site origin and add HTTPS when needed.</p>
            </div>
            <label>
              Jira URL
              <input
                value={form.jiraBaseUrl}
                placeholder="jira.example.com/some/path"
                onBlur={() => setForm({ ...form, jiraBaseUrl: normalizedJiraUrl })}
                onChange={(event) => setForm({ ...form, jiraBaseUrl: event.target.value })}
              />
            </label>
            <div className="normalized-url">
              <span>Will save as</span>
              <strong>{normalizedJiraUrl || "Waiting for URL"}</strong>
            </div>
          </div>
        ) : null}

        {step === "token" ? (
          <div className="setup-step-panel">
            <div>
              <p className="eyebrow">Step 2</p>
              <h3>Create a Jira token</h3>
              <p className="setup-copy">Open the generated Jira profile link, create a token, then paste it here. The token is saved locally and never returned back to the UI after saving.</p>
            </div>
            <a className={`token-link ${tokenUrl ? "" : "disabled"}`} href={tokenUrl || undefined} target="_blank" rel="noreferrer">
              <ExternalLink size={17} aria-hidden="true" />
              <span>Open token page</span>
            </a>
            <label>
              API Token
              <input
                type="password"
                value={form.jiraToken}
                placeholder={config?.jiraTokenSaved ? "Leave blank to keep saved token" : "Paste Jira token"}
                onChange={(event) => setForm({ ...form, jiraToken: event.target.value })}
              />
            </label>
          </div>
        ) : null}

        {step === "project" ? (
          <div className="setup-step-panel">
            <div>
              <p className="eyebrow">Step 3</p>
              <h3>Choose the Jira project</h3>
              <p className="setup-copy">Enter the project key to sync and analyze.</p>
            </div>
            <label>
              Project Key
              <input value={form.jiraProject} placeholder="PROJ" onChange={(event) => setForm({ ...form, jiraProject: event.target.value.toUpperCase() })} />
            </label>
          </div>
        ) : null}

        {step === "codex" ? (
          <div className="setup-step-panel">
            <div>
              <p className="eyebrow">Step 4</p>
              <h3>Check Codex</h3>
              <p className="setup-copy">The app uses your local Codex installation for ticket analysis. Keep the binary as `codex` unless it lives elsewhere.</p>
            </div>
            <div className="form-grid">
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
                <input type="number" min="1" max="65535" value={form.port} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} />
              </label>
              <label className="wide-field">
                Cache Directory
                <input value={form.cacheDir} onChange={(event) => setForm({ ...form, cacheDir: event.target.value })} />
              </label>
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="setup-step-panel">
            <div>
              <p className="eyebrow">Step 5</p>
              <h3>Review and save</h3>
              <p className="setup-copy">Save these settings, then use Sync and Analyze from the top bar.</p>
            </div>
            <div className="review-grid">
              <ReviewItem label="Jira URL" value={normalizedJiraUrl || "Missing"} />
              <ReviewItem label="Project" value={form.jiraProject.trim().toUpperCase() || "Missing"} />
              <ReviewItem label="Token" value={(form.jiraToken.trim() || config?.jiraTokenSaved) ? "Ready" : "Missing"} />
              <ReviewItem label="Codex" value={form.codexBin || "codex"} />
              <ReviewItem label="Config file" value={config?.configPath ?? ".vision-cache/config.env"} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="setup-footer">
        <button type="button" className="icon-button secondary" onClick={goBack} disabled={currentStepIndex === 0 || saving}>
          <span>Back</span>
        </button>
        {step === "review" ? (
          <button type="button" className="icon-button primary" onClick={() => void saveConfig()} disabled={saving}>
            <Save size={17} aria-hidden="true" />
            <span>{saving ? "Saving" : "Save and Finish"}</span>
          </button>
        ) : (
          <button type="button" className="icon-button primary" onClick={goNext} disabled={saving}>
            <span>Next</span>
          </button>
        )}
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

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function normalizeJiraUrl(value: string): string {
  let next = value.trim();
  if (!next) {
    return "";
  }
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(next)) {
    next = `https://${next}`;
  }
  try {
    const url = new URL(next);
    if (!url.host) {
      return "";
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return next.replace(/\/+$/, "");
  }
}

function buildTokenUrl(baseUrl: string): string {
  if (!baseUrl) {
    return "";
  }
  return `${baseUrl}/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error";
}
