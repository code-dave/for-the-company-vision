import { AlertTriangle } from "lucide-react";
import type { Outlier } from "../types";

type Props = {
  outliers: Outlier[];
};

export function OutlierList({ outliers }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Alignment review</p>
          <h2>Outlier tasks</h2>
        </div>
      </div>
      <div className="outlier-list">
        {outliers.length === 0 ? <p className="muted">No outliers identified in the current analysis.</p> : null}
        {outliers.map((outlier) => (
          <article className={`outlier-item ${outlier.severity}`} key={outlier.issueKey}>
            <div className="outlier-title">
              <AlertTriangle size={16} aria-hidden="true" />
              <a href={`#issue-${outlier.issueKey}`}>{outlier.issueKey}</a>
              <strong>{outlier.title}</strong>
            </div>
            <p>{outlier.reason}</p>
            {outlier.recommendedFit ? <span>Possible fit: {outlier.recommendedFit}</span> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

