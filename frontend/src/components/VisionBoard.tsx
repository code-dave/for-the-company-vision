import { AlertTriangle, CheckCircle2, CircleDot, Layers3, ListChecks, Target } from "lucide-react";
import type { ReactNode } from "react";
import { confidenceLabel } from "../lib/format";
import type { BigRock, BoardAnalysis, Outlier, SmallRock } from "../types";

type Props = {
  analysis: BoardAnalysis;
};

export function VisionBoard({ analysis }: Props) {
  const smallRockCount = analysis.bigRocks.reduce((total, rock) => total + rock.smallRocks.length, 0);
  const linkedIssueCount = new Set(analysis.bigRocks.flatMap((rock) => [...rock.issueKeys, ...rock.smallRocks.flatMap((small) => small.issueKeys)])).size;
  const topOutliers = [...analysis.outliers].sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 8);

  return (
    <section className="board-section vision-map-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Vision board</p>
          <h2>Strategic map</h2>
        </div>
      </div>

      <div className="vision-board-summary">
        <SummaryTile icon={<Target size={18} />} label="Big rocks" value={analysis.bigRocks.length} />
        <SummaryTile icon={<Layers3 size={18} />} label="Small rocks" value={smallRockCount} />
        <SummaryTile icon={<ListChecks size={18} />} label="Linked issues" value={linkedIssueCount} />
        <SummaryTile icon={<AlertTriangle size={18} />} label="Outliers" value={analysis.outliers.length} tone="risk" />
      </div>

      <div className="vision-map-layout">
        <div className="vision-lanes" aria-label="Strategic big rock lanes">
          {analysis.bigRocks.length === 0 ? <p className="muted">No strategic clusters were generated for this analysis.</p> : null}
          {analysis.bigRocks.map((rock, index) => (
            <BigRockLane key={rock.id} rock={rock} index={index} />
          ))}
        </div>

        <aside className="alignment-rail" aria-label="Alignment watchlist">
          <div>
            <p className="eyebrow">Alignment watchlist</p>
            <h3>Tasks to inspect</h3>
          </div>
          {topOutliers.length === 0 ? (
            <div className="alignment-empty">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>No outliers identified.</span>
            </div>
          ) : null}
          {topOutliers.map((outlier) => (
            <OutlierCard key={outlier.issueKey} outlier={outlier} />
          ))}
        </aside>
      </div>
    </section>
  );
}

function SummaryTile({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: number; tone?: "default" | "risk" }) {
  return (
    <div className={`vision-summary-tile ${tone}`}>
      <span>{icon}</span>
      <div>
        <strong>{value.toLocaleString()}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function BigRockLane({ rock, index }: { rock: BigRock; index: number }) {
  return (
    <article className="vision-lane">
      <div className="lane-header">
        <span className="lane-number">BR-{String(index + 1).padStart(2, "0")}</span>
        <div>
          <h3>{rock.title}</h3>
          <p>{rock.rationale}</p>
        </div>
      </div>

      <div className="lane-meta">
        <span>{rock.status}</span>
        <span>{confidenceLabel(rock.confidence)} confidence</span>
        <span>{rock.issueKeys.length} issues</span>
      </div>

      <div className="lane-confidence" aria-label={`${confidenceLabel(rock.confidence)} confidence`}>
        <span style={{ width: `${confidencePercent(rock.confidence)}%` }} />
      </div>

      <div className="issue-strip" aria-label="Big rock Jira issues">
        {rock.issueKeys.slice(0, 8).map((issueKey) => (
          <a key={issueKey} href={`#issue-${issueKey}`}>
            {issueKey}
          </a>
        ))}
        {rock.issueKeys.length > 8 ? <span>+{rock.issueKeys.length - 8}</span> : null}
      </div>

      <div className="small-rock-board">
        {rock.smallRocks.length === 0 ? <p className="muted">No small rocks mapped to this cluster.</p> : null}
        {rock.smallRocks.map((small) => (
          <SmallRockCard key={small.id} small={small} />
        ))}
      </div>
    </article>
  );
}

function SmallRockCard({ small }: { small: SmallRock }) {
  return (
    <article className="small-rock-card">
      <div className="small-rock-title">
        <CircleDot size={15} aria-hidden="true" />
        <h4>{small.title}</h4>
      </div>
      <p>{small.whyItFits}</p>
      <div className="small-rock-footer">
        <span>{small.status}</span>
        <span>{confidenceLabel(small.confidence)}</span>
      </div>
      <div className="issue-strip compact" aria-label="Small rock Jira issues">
        {small.issueKeys.slice(0, 4).map((issueKey) => (
          <a key={issueKey} href={`#issue-${issueKey}`}>
            {issueKey}
          </a>
        ))}
        {small.issueKeys.length > 4 ? <span>+{small.issueKeys.length - 4}</span> : null}
      </div>
    </article>
  );
}

function OutlierCard({ outlier }: { outlier: Outlier }) {
  return (
    <article className={`alignment-card ${outlier.severity}`}>
      <div>
        <span>{outlier.severity}</span>
        <a href={`#issue-${outlier.issueKey}`}>{outlier.issueKey}</a>
      </div>
      <strong>{outlier.title}</strong>
      <p>{outlier.reason}</p>
      {outlier.recommendedFit ? <em>Possible fit: {outlier.recommendedFit}</em> : null}
    </article>
  );
}

function severityRank(severity: Outlier["severity"]) {
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function confidencePercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}
