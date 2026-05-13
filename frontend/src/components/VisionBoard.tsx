import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Gauge,
  Layers3,
  Lightbulb,
  ListChecks,
  Target
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { confidenceLabel } from "../lib/format";
import type { BigRock, BoardAnalysis, Outlier, SmallRock } from "../types";

type Props = {
  analysis: BoardAnalysis;
};

type RockEntry = {
  rock: BigRock;
  index: number;
};

type PortfolioAllocation = RockEntry & {
  issueCount: number;
  smallRockCount: number;
  allocation: number;
  outlierCount: number;
  highOutlierCount: number;
  mediumOutlierCount: number;
  posture: string;
};

export function VisionBoard({ analysis }: Props) {
  const smallRockCount = analysis.bigRocks.reduce((total, rock) => total + rock.smallRocks.length, 0);
  const linkedIssueCount = new Set(analysis.bigRocks.flatMap((rock) => [...rock.issueKeys, ...rock.smallRocks.flatMap((small) => small.issueKeys)])).size;
  const rockIds = useMemo(() => analysis.bigRocks.map((rock) => rock.id), [analysis.bigRocks]);
  const rockSignature = rockIds.join("|");
  const [expandedRockIds, setExpandedRockIds] = useState<Set<string>>(() => new Set(rockIds));
  const [selectedRockId, setSelectedRockId] = useState("all");
  const [storyExpanded, setStoryExpanded] = useState(true);
  const [showEvidence, setShowEvidence] = useState(true);
  const [showRisks, setShowRisks] = useState(true);
  const focusedRock = selectedRockId === "all" ? null : analysis.bigRocks.find((rock) => rock.id === selectedRockId) ?? null;
  const focusedOutliers = useMemo(() => outliersForFocus(analysis.outliers, focusedRock), [analysis.outliers, focusedRock]);
  const topOutliers = [...focusedOutliers].sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 8);
  const visibleRockEntries = analysis.bigRocks
    .map((rock, index) => ({ rock, index }))
    .filter((entry) => !focusedRock || entry.rock.id === focusedRock.id);
  const visibleRockIds = visibleRockEntries.map((entry) => entry.rock.id);
  const allExpanded = visibleRockIds.length > 0 && visibleRockIds.every((id) => expandedRockIds.has(id));

  useEffect(() => {
    setExpandedRockIds(new Set(rockIds));
    setSelectedRockId((current) => (current === "all" || rockIds.includes(current) ? current : "all"));
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
    setExpandedRockIds((current) => {
      const next = new Set(current);
      visibleRockIds.forEach((id) => {
        if (expanded) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }

  return (
    <section className="board-section vision-map-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Vision board</p>
          <h2>Strategic map</h2>
        </div>
        <div className="board-actions">
          <label className="board-filter">
            Focus
            <select value={selectedRockId} onChange={(event) => setSelectedRockId(event.target.value)}>
              <option value="all">Portfolio view</option>
              {analysis.bigRocks.map((rock, index) => (
                <option key={rock.id} value={rock.id}>
                  BR-{String(index + 1).padStart(2, "0")} {rock.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="icon-button secondary" onClick={() => setAllExpanded(!allExpanded)} disabled={visibleRockIds.length === 0}>
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

      <StrategyStoryMap
        analysis={analysis}
        visibleRockEntries={visibleRockEntries}
        focusedRock={focusedRock}
        outliers={focusedOutliers}
        expanded={storyExpanded}
        showEvidence={showEvidence}
        showRisks={showRisks}
        onExpandedChange={setStoryExpanded}
        onShowEvidenceChange={setShowEvidence}
        onShowRisksChange={setShowRisks}
      />

      <div className="vision-map-layout">
        <div className="vision-lanes" aria-label="Strategic big rock lanes">
          {analysis.bigRocks.length === 0 ? <p className="muted">No strategic clusters were generated for this analysis.</p> : null}
          {visibleRockEntries.map(({ rock, index }) => (
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

function StrategyStoryMap({
  analysis,
  visibleRockEntries,
  focusedRock,
  outliers,
  expanded,
  showEvidence,
  showRisks,
  onExpandedChange,
  onShowEvidenceChange,
  onShowRisksChange
}: {
  analysis: BoardAnalysis;
  visibleRockEntries: RockEntry[];
  focusedRock: BigRock | null;
  outliers: Outlier[];
  expanded: boolean;
  showEvidence: boolean;
  showRisks: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onShowEvidenceChange: (show: boolean) => void;
  onShowRisksChange: (show: boolean) => void;
}) {
  const allocations = buildPortfolioAllocations(visibleRockEntries, outliers);
  const focusLabel = focusedRock ? focusedRock.title : "Portfolio view";
  const toggleLabel = expanded ? (focusedRock ? "Hide Story" : "Hide View") : focusedRock ? "Show Story" : "Show View";

  return (
    <div className="strategy-story-panel">
      <div className="strategy-story-header">
        <div>
          <p className="eyebrow">{focusedRock ? "Focused strategy map" : "Executive portfolio view"}</p>
          <h3>{focusLabel}</h3>
        </div>
        <div className="story-controls">
          <label>
            <input type="checkbox" checked={showEvidence} onChange={(event) => onShowEvidenceChange(event.target.checked)} />
            Evidence
          </label>
          <label>
            <input type="checkbox" checked={showRisks} onChange={(event) => onShowRisksChange(event.target.checked)} />
            Risks
          </label>
          <button type="button" className="icon-button secondary" onClick={() => onExpandedChange(!expanded)}>
            {expanded ? <ChevronRight size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
            <span>{toggleLabel}</span>
          </button>
        </div>
      </div>
      {expanded ? (
        focusedRock ? (
          <FocusedStrategyMap analysis={analysis} visibleRockEntries={visibleRockEntries} outliers={outliers} showEvidence={showEvidence} showRisks={showRisks} />
        ) : (
          <PortfolioView analysis={analysis} allocations={allocations} outliers={outliers} showEvidence={showEvidence} showRisks={showRisks} />
        )
      ) : (
        <div className="strategy-story-collapsed">
          <strong>{focusedRock ? "Focused story collapsed" : "Portfolio view collapsed"}</strong>
          <span>Focus and lane filters remain active below.</span>
        </div>
      )}
    </div>
  );
}

function PortfolioView({
  analysis,
  allocations,
  outliers,
  showEvidence,
  showRisks
}: {
  analysis: BoardAnalysis;
  allocations: PortfolioAllocation[];
  outliers: Outlier[];
  showEvidence: boolean;
  showRisks: boolean;
}) {
  const totalIssues = allocations.reduce((total, entry) => total + entry.issueCount, 0);
  const totalSmallRocks = allocations.reduce((total, entry) => total + entry.smallRockCount, 0);
  const topAllocation = allocations[0];
  const topRisk = allocations.find((entry) => entry.outlierCount > 0);
  const highRiskCount = outliers.filter((outlier) => outlier.severity === "high").length;
  const portfolioShape = concentrationSummary(topAllocation?.allocation ?? 0);
  const evidenceText =
    analysis.metrics.analyzedIssues > 0
      ? `${analysis.metrics.analyzedIssues.toLocaleString()} analyzed of ${analysis.metrics.totalIssues.toLocaleString()} Jira issues`
      : `${totalIssues.toLocaleString()} Jira issues mapped to strategy`;

  if (allocations.length === 0) {
    return (
      <div className="portfolio-empty-state">
        <BriefcaseBusiness size={22} aria-hidden="true" />
        <strong>No portfolio allocation yet</strong>
        <span>Run analysis after syncing Jira to generate big rocks, investment allocation, and attention items.</span>
      </div>
    );
  }

  return (
    <div className="portfolio-view">
      <div className="portfolio-command-grid">
        <PortfolioSignal
          icon={<Target size={18} />}
          label="Strategic thesis"
          title={analysis.health.alignment}
          detail={analysis.visionSummary}
          stats={[`${analysis.health.score} alignment score`, `${confidenceLabel(analysis.health.confidence)} confidence`]}
        />
        <PortfolioSignal
          icon={<Gauge size={18} />}
          label="Operating shape"
          title={portfolioShape}
          detail={topAllocation ? `${topAllocation.rock.title} carries ${topAllocation.allocation}% of mapped work.` : "No mapped work is concentrated yet."}
          stats={[`${allocations.length} big rocks`, `${totalSmallRocks} small rocks`, evidenceText]}
        />
        <PortfolioSignal
          icon={<AlertTriangle size={18} />}
          label="Leadership attention"
          title={`${outliers.length} attention items`}
          detail={
            topRisk
              ? `${topRisk.rock.title} has the highest visible outlier pressure.`
              : analysis.health.risks[0] ?? "No portfolio risks were returned by the analysis."
          }
          stats={[`${highRiskCount} high severity`, `${analysis.metrics.withoutEpicCount.toLocaleString()} without epic`, `${analysis.health.nextMoves.length} next moves`]}
          tone={outliers.length > 0 ? "risk" : "good"}
        />
      </div>

      <div className="portfolio-story-layout">
        <section className="portfolio-allocation-panel">
          <div className="portfolio-section-head">
            <div>
              <p className="eyebrow">Portfolio allocation</p>
              <h4>Ranked investment pillars</h4>
            </div>
            <span>{totalIssues.toLocaleString()} mapped issues</span>
          </div>
          <div className="portfolio-allocation-list">
            {allocations.map((entry) => (
              <PortfolioAllocationRow key={entry.rock.id} entry={entry} showEvidence={showEvidence} />
            ))}
          </div>
        </section>

        <section className="portfolio-attention-panel">
          <div className="portfolio-section-head">
            <div>
              <p className="eyebrow">Executive queue</p>
              <h4>Decisions and pressure points</h4>
            </div>
          </div>

          <div className="decision-list">
            {analysis.health.nextMoves.slice(0, 4).map((move) => (
              <div key={move} className="decision-item">
                <Lightbulb size={15} aria-hidden="true" />
                <span>{move}</span>
              </div>
            ))}
          </div>

          {showRisks ? (
            <div className="portfolio-risk-stack">
              {analysis.health.risks.slice(0, 3).map((risk) => (
                <div key={risk} className="story-risk-item">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>{risk}</span>
                </div>
              ))}
              {[...outliers]
                .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
                .slice(0, 5)
                .map((outlier) => (
                  <div key={outlier.issueKey} className={`story-outlier-chip ${outlier.severity}`}>
                    <strong>{outlier.issueKey}</strong>
                    <span>{outlier.title}</span>
                  </div>
                ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function PortfolioSignal({
  icon,
  label,
  title,
  detail,
  stats,
  tone = "default"
}: {
  icon: ReactNode;
  label: string;
  title: string;
  detail: string;
  stats: string[];
  tone?: "default" | "risk" | "good";
}) {
  return (
    <article className={`portfolio-signal ${tone}`}>
      <span className="portfolio-signal-icon">{icon}</span>
      <div>
        <p className="eyebrow">{label}</p>
        <h4>{title}</h4>
        <p>{detail}</p>
      </div>
      <div className="portfolio-signal-stats">
        {stats.map((stat) => (
          <span key={stat}>{stat}</span>
        ))}
      </div>
    </article>
  );
}

function PortfolioAllocationRow({ entry, showEvidence }: { entry: PortfolioAllocation; showEvidence: boolean }) {
  return (
    <article className={`portfolio-allocation-row ${entry.outlierCount > 0 ? "watch" : ""}`}>
      <span className="portfolio-rank">BR-{String(entry.index + 1).padStart(2, "0")}</span>
      <div className="portfolio-allocation-main">
        <div className="portfolio-allocation-title">
          <strong>{entry.rock.title}</strong>
          <span>{entry.posture}</span>
        </div>
        <p>{entry.rock.rationale}</p>
        <div className="portfolio-allocation-bar" aria-label={`${entry.allocation}% portfolio allocation`}>
          <span style={{ width: `${Math.max(entry.allocation, entry.issueCount > 0 ? 4 : 0)}%` }} />
        </div>
        {showEvidence ? (
          <div className="story-evidence">
            <span>{entry.issueCount} Jira issues</span>
            <span>{entry.allocation}% allocation</span>
            <span>{entry.smallRockCount} small rocks</span>
            <span>{confidenceLabel(entry.rock.confidence)} confidence</span>
            {entry.outlierCount > 0 ? <span>{entry.outlierCount} attention items</span> : null}
            {entry.mediumOutlierCount > 0 ? <span>{entry.mediumOutlierCount} medium risks</span> : null}
          </div>
        ) : null}
      </div>
      <div className="portfolio-allocation-score">
        <strong>{entry.allocation}%</strong>
        <span>allocation</span>
        {entry.outlierCount > 0 ? <em>{entry.highOutlierCount > 0 ? "High risk" : "Watch"}</em> : null}
      </div>
    </article>
  );
}

function FocusedStrategyMap({
  analysis,
  visibleRockEntries,
  outliers,
  showEvidence,
  showRisks
}: {
  analysis: BoardAnalysis;
  visibleRockEntries: RockEntry[];
  outliers: Outlier[];
  showEvidence: boolean;
  showRisks: boolean;
}) {
  const primaryRocks = [...visibleRockEntries].sort((a, b) => b.rock.issueKeys.length - a.rock.issueKeys.length);
  const totalVisibleIssues = visibleRockEntries.reduce((total, entry) => total + entry.rock.issueKeys.length, 0);
  const totalVisibleSmallRocks = visibleRockEntries.reduce((total, entry) => total + entry.rock.smallRocks.length, 0);

  return (
    <div className="strategy-story-grid">
      <section className="story-column story-intent">
        <div className="story-column-header">
          <span>1</span>
          <div>
            <p className="eyebrow">Strategic intent</p>
            <h4>{analysis.health.alignment}</h4>
          </div>
        </div>
        <p>{analysis.visionSummary}</p>
        <div className="story-score-card">
          <div className="story-score">{analysis.health.score}</div>
          <div>
            <strong>Alignment score</strong>
            <span>{confidenceLabel(analysis.health.confidence)} confidence</span>
          </div>
        </div>
        <div className="story-stat-row">
          <span>{totalVisibleIssues} issues in focus</span>
          <span>{totalVisibleSmallRocks} small rocks</span>
        </div>
      </section>

      <div className="story-arrow" aria-hidden="true">
        <ArrowRight size={22} />
      </div>

      <section className="story-column story-investments">
        <div className="story-column-header">
          <span>2</span>
          <div>
            <p className="eyebrow">Investment pillar</p>
            <h4>Work connected to this strategic bet</h4>
          </div>
        </div>
        <div className="story-pillar-list">
          {primaryRocks.map((entry) => (
            <StoryPillar key={entry.rock.id} rock={entry.rock} index={entry.index} showEvidence={showEvidence} />
          ))}
        </div>
      </section>

      <div className="story-arrow" aria-hidden="true">
        <ArrowRight size={22} />
      </div>

      <section className="story-column story-decisions">
        <div className="story-column-header">
          <span>3</span>
          <div>
            <p className="eyebrow">Leadership attention</p>
            <h4>Decisions, risks, and next moves</h4>
          </div>
        </div>
        <div className="decision-list">
          {analysis.health.nextMoves.slice(0, 3).map((move) => (
            <div key={move} className="decision-item">
              <Lightbulb size={15} aria-hidden="true" />
              <span>{move}</span>
            </div>
          ))}
        </div>
        {showRisks ? (
          <div className="story-risk-list">
            {analysis.health.risks.slice(0, 3).map((risk) => (
              <div key={risk} className="story-risk-item">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>{risk}</span>
              </div>
            ))}
            {outliers.slice(0, 3).map((outlier) => (
              <div key={outlier.issueKey} className={`story-outlier-chip ${outlier.severity}`}>
                <strong>{outlier.issueKey}</strong>
                <span>{outlier.title}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StoryPillar({ rock, index, showEvidence }: { rock: BigRock; index: number; showEvidence: boolean }) {
  return (
    <article className="story-pillar">
      <div className="story-pillar-head">
        <span>BR-{String(index + 1).padStart(2, "0")}</span>
        <strong>{rock.title}</strong>
      </div>
      <p>{rock.rationale}</p>
      <div className="story-pillar-meter" aria-label={`${confidenceLabel(rock.confidence)} confidence`}>
        <span style={{ width: `${confidencePercent(rock.confidence)}%` }} />
      </div>
      {showEvidence ? (
        <div className="story-evidence">
          <span>{rock.issueKeys.length} Jira issues</span>
          <span>{rock.smallRocks.length} small rocks</span>
          <span>{confidenceLabel(rock.confidence)} confidence</span>
        </div>
      ) : null}
    </article>
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

function outliersForFocus(outliers: Outlier[], rock: BigRock | null) {
  if (!rock) {
    return outliers;
  }
  return outliers.filter((outlier) => outlierMatchesRock(outlier, rock));
}

function buildPortfolioAllocations(entries: RockEntry[], outliers: Outlier[]): PortfolioAllocation[] {
  const totalIssues = entries.reduce((total, entry) => total + entry.rock.issueKeys.length, 0);
  return entries
    .map((entry) => {
      const matchedOutliers = outliers.filter((outlier) => outlierMatchesRock(outlier, entry.rock));
      const highOutlierCount = matchedOutliers.filter((outlier) => outlier.severity === "high").length;
      const mediumOutlierCount = matchedOutliers.filter((outlier) => outlier.severity === "medium").length;
      const allocation = totalIssues > 0 ? Math.round((entry.rock.issueKeys.length / totalIssues) * 100) : 0;
      return {
        ...entry,
        issueCount: entry.rock.issueKeys.length,
        smallRockCount: entry.rock.smallRocks.length,
        allocation,
        outlierCount: matchedOutliers.length,
        highOutlierCount,
        mediumOutlierCount,
        posture: allocationPosture(allocation, matchedOutliers.length, highOutlierCount, entry.rock.confidence)
      };
    })
    .sort((a, b) => b.issueCount - a.issueCount || b.smallRockCount - a.smallRockCount);
}

function outlierMatchesRock(outlier: Outlier, rock: BigRock) {
  const title = rock.title.toLowerCase();
  const issueKeys = new Set([...rock.issueKeys, ...rock.smallRocks.flatMap((small) => small.issueKeys)]);
  const recommendedFit = outlier.recommendedFit?.toLowerCase() ?? "";
  return issueKeys.has(outlier.issueKey) || (recommendedFit !== "" && (recommendedFit.includes(title) || title.includes(recommendedFit)));
}

function allocationPosture(allocation: number, outlierCount: number, highOutlierCount: number, confidence: number) {
  if (highOutlierCount > 0) {
    return "Leadership risk";
  }
  if (outlierCount > 0) {
    return "Needs inspection";
  }
  if (allocation >= 35) {
    return "Major investment";
  }
  if (confidence < 0.5) {
    return "Needs validation";
  }
  if (allocation <= 8) {
    return "Thin coverage";
  }
  return "Balanced pillar";
}

function concentrationSummary(topAllocation: number) {
  if (topAllocation >= 45) {
    return "Concentrated portfolio";
  }
  if (topAllocation >= 30) {
    return "Led by one major bet";
  }
  if (topAllocation > 0) {
    return "Distributed investment";
  }
  return "No mapped allocation";
}

function confidencePercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}
