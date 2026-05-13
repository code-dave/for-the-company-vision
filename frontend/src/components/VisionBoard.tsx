import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleDot, Layers3, ListChecks, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const rockIds = useMemo(() => analysis.bigRocks.map((rock) => rock.id), [analysis.bigRocks]);
  const rockSignature = rockIds.join("|");
  const [expandedRockIds, setExpandedRockIds] = useState<Set<string>>(() => new Set(rockIds));
  const allExpanded = expandedRockIds.size === rockIds.length && rockIds.length > 0;

  useEffect(() => {
    setExpandedRockIds(new Set(rockIds));
  }, [rockSignature]);

  function toggleRock(id: string) {
    setExpandedRockIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function setAllExpanded(expanded: boolean) {
    setExpandedRockIds(expanded ? new Set(rockIds) : new Set());
  }

  return (
    <section className="board-section vision-map-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Vision board</p>
          <h2>Strategic map</h2>
        </div>
        <div className="board-actions">
          <button type="button" className="icon-button secondary" onClick={() => setAllExpanded(!allExpanded)} disabled={rockIds.length === 0}>
            {allExpanded ? <ChevronRight size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
            <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
          </button>
        </div>
      </div>

      <div className="vision-board-summary">
        <SummaryTile icon={<Target size={18} />} label="Big rocks" value={analysis.bigRocks.length} />
        <SummaryTile icon={<Layers3 size={18} />} label="Small rocks" value={smallRockCount} />
        <SummaryTile icon={<ListChecks size={18} />} label="Linked issues" value={linkedIssueCount} />
        <SummaryTile icon={<AlertTriangle size={18} />} label="Outliers" value={analysis.outliers.length} tone="risk" />
      </div>

      <PortfolioNetwork bigRocks={analysis.bigRocks} outliers={topOutliers} />

      <div className="vision-map-layout">
        <div className="vision-lanes" aria-label="Strategic big rock lanes">
          {analysis.bigRocks.length === 0 ? <p className="muted">No strategic clusters were generated for this analysis.</p> : null}
          {analysis.bigRocks.map((rock, index) => (
            <BigRockLane key={rock.id} rock={rock} index={index} expanded={expandedRockIds.has(rock.id)} onToggle={() => toggleRock(rock.id)} />
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

function PortfolioNetwork({ bigRocks, outliers }: { bigRocks: BigRock[]; outliers: Outlier[] }) {
  const center = { x: 500, y: 215 };
  const riskHub = { x: 845, y: 215 };
  const maxIssues = Math.max(1, ...bigRocks.map((rock) => rock.issueKeys.length));
  const nodes = bigRocks.map((rock, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, bigRocks.length);
    const radius = 42 + Math.round((rock.issueKeys.length / maxIssues) * 18);
    return {
      rock,
      index,
      radius,
      x: center.x + Math.cos(angle) * 305,
      y: center.y + Math.sin(angle) * 145
    };
  });

  return (
    <div className="portfolio-network-panel">
      <div className="portfolio-network-header">
        <div>
          <p className="eyebrow">Executive network</p>
          <h3>How the strategy clusters hang together</h3>
        </div>
      </div>
      <div className="portfolio-network-canvas">
        <svg viewBox="0 0 1000 430" role="img" aria-label="Network map of portfolio vision, big rocks, small rocks, and alignment outliers">
          <defs>
            <radialGradient id="portfolioCenter" cx="50%" cy="45%" r="70%">
              <stop offset="0%" stopColor="#4b7ba5" />
              <stop offset="100%" stopColor="#294b68" />
            </radialGradient>
            <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#20262d" floodOpacity="0.16" />
            </filter>
          </defs>

          {nodes.map((node) => (
            <g key={`${node.rock.id}-edge`}>
              <line className="network-link" x1={center.x} y1={center.y} x2={node.x} y2={node.y} />
              {node.rock.smallRocks.slice(0, 10).map((small, smallIndex) => {
                const point = smallRockPoint(node.x, node.y, node.radius, smallIndex, Math.min(10, node.rock.smallRocks.length));
                return <line key={`${small.id}-link`} className="network-small-link" x1={node.x} y1={node.y} x2={point.x} y2={point.y} />;
              })}
            </g>
          ))}

          <line className="network-risk-link" x1={center.x + 60} y1={center.y} x2={riskHub.x - 48} y2={riskHub.y} />

          <g className="network-center-node" filter="url(#nodeShadow)">
            <circle cx={center.x} cy={center.y} r="64" />
            <text x={center.x} y={center.y - 8}>
              <tspan x={center.x}>Portfolio</tspan>
              <tspan x={center.x} dy="17">
                Vision
              </tspan>
            </text>
            <text className="network-node-subtitle" x={center.x} y={center.y + 35}>
              {bigRocks.length} big rocks
            </text>
          </g>

          {nodes.map((node) => (
            <g key={node.rock.id}>
              {node.rock.smallRocks.slice(0, 10).map((small, smallIndex) => {
                const point = smallRockPoint(node.x, node.y, node.radius, smallIndex, Math.min(10, node.rock.smallRocks.length));
                return (
                  <g key={small.id} className="network-small-node">
                    <title>{small.title}</title>
                    <circle cx={point.x} cy={point.y} r="7" />
                  </g>
                );
              })}
              <g className="network-big-node" filter="url(#nodeShadow)">
                <title>{node.rock.title}</title>
                <circle cx={node.x} cy={node.y} r={node.radius} />
                <text className="network-node-index" x={node.x} y={node.y - 19}>
                  BR-{String(node.index + 1).padStart(2, "0")}
                </text>
                <text className="network-big-title" x={node.x} y={node.y + 2}>
                  {titleLines(node.rock.title).map((line, lineIndex) => (
                    <tspan key={`${line}-${lineIndex}`} x={node.x} dy={lineIndex === 0 ? 0 : 14}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text className="network-node-subtitle" x={node.x} y={node.y + node.radius - 13}>
                  {node.rock.issueKeys.length} issues
                </text>
              </g>
            </g>
          ))}

          <g className="network-risk-node" filter="url(#nodeShadow)">
            <circle cx={riskHub.x} cy={riskHub.y} r="46" />
            <text x={riskHub.x} y={riskHub.y - 5}>
              Risk
            </text>
            <text className="network-node-subtitle" x={riskHub.x} y={riskHub.y + 17}>
              {outliers.length} outliers
            </text>
          </g>

          {outliers.slice(0, 6).map((outlier, index) => {
            const y = 82 + index * 46;
            return (
              <g key={outlier.issueKey} className={`network-outlier-node ${outlier.severity}`}>
                <title>{outlier.title}</title>
                <line className="network-risk-link muted" x1={riskHub.x + 40} y1={riskHub.y} x2="948" y2={y} />
                <circle cx="948" cy={y} r="10" />
                <text x="930" y={y + 4}>
                  {outlier.issueKey}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="portfolio-network-legend" aria-label="Network legend">
        <span>
          <i className="legend-big" /> Big rocks sized by Jira issue count
        </span>
        <span>
          <i className="legend-small" /> Small rocks clustered around each big rock
        </span>
        <span>
          <i className="legend-risk" /> Outliers separated as alignment risk
        </span>
      </div>
    </div>
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

function BigRockLane({ rock, index, expanded, onToggle }: { rock: BigRock; index: number; expanded: boolean; onToggle: () => void }) {
  return (
    <article className={`vision-lane ${expanded ? "expanded" : "collapsed"}`}>
      <div className="lane-header">
        <span className="lane-number">BR-{String(index + 1).padStart(2, "0")}</span>
        <div>
          <h3>{rock.title}</h3>
          {expanded ? <p>{rock.rationale}</p> : null}
        </div>
        <button type="button" className="lane-toggle" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
          <span>{expanded ? "Collapse" : "Expand"}</span>
        </button>
      </div>

      <div className="lane-meta">
        <span>{rock.status}</span>
        <span>{confidenceLabel(rock.confidence)} confidence</span>
        <span>{rock.issueKeys.length} issues</span>
        <span>{rock.smallRocks.length} small rocks</span>
      </div>

      {expanded ? (
        <>
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
        </>
      ) : null}
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

function smallRockPoint(x: number, y: number, radius: number, index: number, count: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, count);
  const distance = radius + 26;
  return {
    x: clamp(x + Math.cos(angle) * distance, 28, 972),
    y: clamp(y + Math.sin(angle) * distance, 28, 402)
  };
}

function titleLines(title: string) {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 15 && current) {
      lines.push(current);
      current = word;
      continue;
    }
    current = next;
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 2).map((line) => (line.length > 17 ? `${line.slice(0, 15)}...` : line));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
