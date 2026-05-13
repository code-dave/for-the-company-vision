import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, Database, GitBranch, Loader2, RefreshCcw, Search, Terminal } from "lucide-react";
import { api } from "./api";
import { MetricsPanel } from "./components/MetricsPanel";
import { VisionBoard } from "./components/VisionBoard";
import { OutlierList } from "./components/OutlierList";
import { BigRockList } from "./components/BigRockList";
import { IssueTable } from "./components/IssueTable";
import { SetupPanel } from "./components/SetupPanel";
import { SignalList } from "./components/SignalList";
import { formatDate } from "./lib/format";
import type { AppConfig, BoardAnalysis, HealthResponse, Snapshot, SyncJob } from "./types";

type LoadState = "idle" | "syncing" | "analyzing" | "loading";
type TabId = "overview" | "board" | "clusters" | "alignment" | "source" | "setup";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [project, setProject] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [analysis, setAnalysis] = useState<BoardAnalysis | null>(null);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoadState("loading");
    setError(null);
    try {
      const nextHealth = await api.health();
      setHealth(nextHealth);
      setProject(nextHealth.defaultProject || "");
      if (nextHealth.defaultProject) {
        await loadCached(nextHealth.defaultProject, false);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadState("idle");
    }
  }

  async function loadCached(nextProject = project, quiet = true) {
    if (!quiet) {
      setError(null);
    }
    const settled = await Promise.allSettled([api.snapshot(nextProject), api.analysis(nextProject)]);
    if (settled[0].status === "fulfilled") {
      setSnapshot(settled[0].value);
    }
    if (settled[1].status === "fulfilled") {
      setAnalysis(settled[1].value);
    }
  }

  async function syncJira() {
    const targetProject = project.trim().toUpperCase();
    if (!targetProject) {
      setError("Choose a Jira project before syncing.");
      return;
    }
    setLoadState("syncing");
    setError(null);
    setSyncJob(null);
    try {
      let job = await api.startSync(targetProject);
      setSyncJob(job);
      while (job.state === "queued" || job.state === "running") {
        await delay(700);
        job = await api.syncJob(job.id);
        setSyncJob(job);
      }
      if (job.state === "failed") {
        throw new Error(job.error || job.message || "Jira sync failed");
      }
      const nextSnapshot = await api.snapshot(job.project);
      setProject(job.project);
      setSnapshot(nextSnapshot);
      setAnalysis(null);
      setActiveTab("source");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadState("idle");
    }
  }

  async function analyze(forceSync: boolean) {
    setLoadState("analyzing");
    setError(null);
    try {
      const result = await api.analyze(project, forceSync);
      setAnalysis(result);
      setActiveTab("overview");
      await loadCached(project);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadState("idle");
    }
  }

  const busy = loadState !== "idle";
  const needsSetup = Boolean(health && (!health.jiraConfigured || !health.defaultProject));
  const statusLine = useMemo(() => {
    if (!health) {
      return "Checking runtime";
    }
    if (!health.jiraConfigured) {
      return "Jira token missing";
    }
    if (!health.codexConfigured) {
      return "Codex CLI unavailable";
    }
    return "Jira and Codex ready";
  }, [health]);

  const tabs = useMemo(
    () =>
      [
        { id: "overview", label: "Overview", enabled: Boolean(analysis) },
        { id: "board", label: "Vision Board", enabled: Boolean(analysis) },
        { id: "clusters", label: "Strategic Clusters", enabled: Boolean(analysis) },
        { id: "alignment", label: "Alignment Review", enabled: Boolean(analysis) },
        { id: "source", label: "Jira Source", enabled: Boolean(snapshot) },
        { id: "setup", label: "Setup", enabled: true }
      ] satisfies Array<{ id: TabId; label: string; enabled: boolean }>,
    [analysis, snapshot]
  );

  async function handleConfigSaved(config: AppConfig) {
    setProject(config.jiraProject || project);
    await bootstrap();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <GitBranch size={22} aria-hidden="true" />
          <div>
            <h1>The Company Vision</h1>
            <p>{statusLine}</p>
          </div>
        </div>

        <div className="project-controls" aria-label="Project controls">
          <label>
            Project
            <input value={project} onChange={(event) => setProject(event.target.value.toUpperCase())} />
          </label>
          <button type="button" className="icon-button secondary" onClick={() => void loadCached(project, false)} disabled={busy} title="Load cached data">
            <Search size={17} aria-hidden="true" />
            <span>Load</span>
          </button>
          <button type="button" className="icon-button secondary" onClick={() => void syncJira()} disabled={busy} title="Sync Jira project">
            {loadState === "syncing" ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <RefreshCcw size={17} aria-hidden="true" />}
            <span>1 Sync Jira</span>
          </button>
          <button type="button" className="icon-button primary" onClick={() => void analyze(false)} disabled={busy || !snapshot} title="Analyze cached Jira data with Codex">
            {loadState === "analyzing" ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <BrainCircuit size={17} aria-hidden="true" />}
            <span>2 Analyze</span>
          </button>
        </div>
      </header>

      {error ? (
        <section className="notice error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
        </section>
      ) : null}

      <WorkflowGuide needsSetup={needsSetup} snapshot={snapshot} analysis={analysis} loadState={loadState} />

      {syncJob ? <SyncProgressPanel job={syncJob} /> : null}

      <section className="runtime-strip">
        <div>
          <span>Last Jira pull</span>
          <strong>{formatDate(snapshot?.pulledAt)}</strong>
        </div>
        <div>
          <span>Issues</span>
          <strong>{snapshot?.issueCount ?? 0}</strong>
        </div>
        <div>
          <span>Analysis</span>
          <strong>{analysis ? formatDate(analysis.generatedAt) : "Not generated"}</strong>
        </div>
        <div>
          <span>Engine</span>
          <strong>{analysis?.model.provider ?? health?.codexBin ?? "codex"}</strong>
        </div>
      </section>

      {analysis ? (
        <>
          <section className="summary-band">
            <div>
              <div className="score-ring" aria-label={`Alignment score ${analysis.health.score}`}>
                {analysis.health.score}
              </div>
            </div>
            <div>
              <p className="eyebrow">Codex synthesis</p>
              <h2>{analysis.health.alignment}</h2>
              <p>{analysis.visionSummary}</p>
            </div>
            <div className="next-moves">
              <p className="eyebrow">Next moves</p>
              {analysis.health.nextMoves.slice(0, 3).map((move) => (
                <div key={move} className="move-item">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{move}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="tab-workspace">
            <div className="tab-list" role="tablist" aria-label="Vision board views">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  disabled={!tab.enabled}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="tab-panel" id={`panel-${activeTab}`} role="tabpanel">
              {activeTab === "overview" ? (
                <section className="dashboard-grid">
                  <MetricsPanel analysis={analysis} />
                  <SignalList signals={analysis.signals} />
                </section>
              ) : null}

              {activeTab === "board" ? <VisionBoard analysis={analysis} /> : null}

              {activeTab === "clusters" ? <BigRockList bigRocks={analysis.bigRocks} /> : null}

              {activeTab === "alignment" ? <OutlierList outliers={analysis.outliers} /> : null}

              {activeTab === "source" && snapshot ? <IssueTable issues={snapshot.issues} /> : null}

              {activeTab === "setup" ? <SetupPanel onSaved={handleConfigSaved} /> : null}
            </div>
          </section>
        </>
      ) : needsSetup ? null : (
        <section className="empty-state">
          <BrainCircuit size={42} aria-hidden="true" />
          <h2>{snapshot ? "Jira sync complete" : "No vision board yet"}</h2>
          <p>
            {snapshot
              ? "Step 2 is ready. Run Codex analysis on the synced Jira cache to generate the big rocks, small rocks, and outlier view."
              : `Step 1 is to sync Jira${project ? ` for ${project}` : ""}. Step 2 is Codex analysis after the Jira pull finishes.`}
          </p>
          <div className="empty-actions">
            <button type="button" className="icon-button secondary" onClick={() => void syncJira()} disabled={busy}>
              <RefreshCcw size={17} aria-hidden="true" />
              <span>1 Sync Jira</span>
            </button>
            <button type="button" className="icon-button primary" onClick={() => void analyze(false)} disabled={busy || !snapshot}>
              <BrainCircuit size={17} aria-hidden="true" />
              <span>2 Analyze</span>
            </button>
          </div>
        </section>
      )}

      {!analysis && snapshot ? (
        <section className="tab-workspace">
          <div className="tab-list" role="tablist" aria-label="Jira source views">
            <button type="button" role="tab" aria-selected={activeTab !== "setup"} aria-controls="panel-source" onClick={() => setActiveTab("source")}>
              Jira Source
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "setup"} aria-controls="panel-setup" onClick={() => setActiveTab("setup")}>
              Setup
            </button>
          </div>
          <div className="tab-panel" id={activeTab === "setup" ? "panel-setup" : "panel-source"} role="tabpanel">
            {activeTab === "setup" ? <SetupPanel onSaved={handleConfigSaved} /> : <IssueTable issues={snapshot.issues} />}
          </div>
        </section>
      ) : null}

      {!analysis && !snapshot ? (
        <section className="tab-workspace">
          <div className="tab-list" role="tablist" aria-label="Setup views">
            <button type="button" role="tab" aria-selected="true" aria-controls="panel-setup">
              Setup
            </button>
          </div>
          <div className="tab-panel" id="panel-setup" role="tabpanel">
            <SetupPanel onSaved={handleConfigSaved} />
          </div>
        </section>
      ) : null}
    </main>
  );
}

function WorkflowGuide({ needsSetup, snapshot, analysis, loadState }: { needsSetup: boolean; snapshot: Snapshot | null; analysis: BoardAnalysis | null; loadState: LoadState }) {
  const syncState = loadState === "syncing" ? "active" : snapshot ? "done" : needsSetup ? "blocked" : "ready";
  const analyzeState = loadState === "analyzing" ? "active" : analysis ? "done" : snapshot ? "ready" : "blocked";
  const headline = needsSetup
    ? "Finish setup before syncing"
    : !snapshot
      ? "Start with 1 Sync Jira"
      : !analysis
        ? "Next step: 2 Analyze"
        : "Vision board is ready";

  return (
    <section className="workflow-guide" aria-label="Workflow">
      <div className="workflow-head">
        <p className="eyebrow">Run order</p>
        <strong>{headline}</strong>
      </div>
      <WorkflowStep icon={<Database size={18} />} number="1" title="Sync Jira" detail="Pull project tickets into the local cache" state={syncState} />
      <ArrowRight className="workflow-arrow" size={18} aria-hidden="true" />
      <WorkflowStep icon={<BrainCircuit size={18} />} number="2" title="Analyze" detail="Ask Codex to build the vision board" state={analyzeState} />
    </section>
  );
}

function WorkflowStep({
  icon,
  number,
  title,
  detail,
  state
}: {
  icon: ReactNode;
  number: string;
  title: string;
  detail: string;
  state: "active" | "blocked" | "done" | "ready";
}) {
  return (
    <div className={`workflow-step ${state}`}>
      <span className="workflow-step-icon">{state === "active" ? <Loader2 className="spin" size={18} aria-hidden="true" /> : state === "done" ? <CheckCircle2 size={18} aria-hidden="true" /> : icon}</span>
      <div>
        <span>{number}</span>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function SyncProgressPanel({ job }: { job: SyncJob }) {
  const percent = Math.max(0, Math.min(100, job.percent || 0));
  const pulledLabel = job.total > 0 ? `${job.pulled.toLocaleString()} / ${job.total.toLocaleString()}` : job.pulled.toLocaleString();
  const stateLabel = job.state === "succeeded" ? "Complete" : job.state === "failed" ? "Failed" : "Running";

  return (
    <section className={`sync-progress-panel ${job.state}`}>
      <div className="sync-progress-header">
        <div>
          <p className="eyebrow">Jira Sync</p>
          <h2>{job.message || stateLabel}</h2>
        </div>
        <strong>{percent}%</strong>
      </div>
      <div className="progress-track" aria-label={`Jira sync ${percent}% complete`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="sync-progress-stats">
        <div>
          <span>State</span>
          <strong>{stateLabel}</strong>
        </div>
        <div>
          <span>Project</span>
          <strong>{job.project}</strong>
        </div>
        <div>
          <span>Issues pulled</span>
          <strong>{pulledLabel}</strong>
        </div>
        <div>
          <span>Stage</span>
          <strong>{job.stage || "starting"}</strong>
        </div>
      </div>
      <div className="terminal-card">
        <div className="terminal-title">
          <Terminal size={16} aria-hidden="true" />
          <span>Live pull details</span>
        </div>
        <div className="terminal-log" role="log" aria-live="polite">
          {job.logs.map((entry, index) => (
            <div key={`${entry.time}-${index}`}>
              <span>{terminalTime(entry.time)}</span>
              <span>[{entry.stage}]</span>
              <span>{entry.message}</span>
            </div>
          ))}
          {job.state === "failed" && job.error ? (
            <div>
              <span>{terminalTime(job.updatedAt)}</span>
              <span>[error]</span>
              <span>{job.error}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function terminalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error";
}
