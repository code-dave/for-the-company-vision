import { Activity, CircleAlert, Lightbulb, ShieldAlert } from "lucide-react";
import type { Signal } from "../types";

type Props = {
  signals: Signal[];
};

export function SignalList({ signals }: Props) {
  return (
    <section className="panel signals-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Codex signals</p>
          <h2>Patterns to inspect</h2>
        </div>
      </div>
      <div className="signal-list">
        {signals.slice(0, 5).map((signal) => (
          <article key={`${signal.kind}-${signal.title}`} className="signal-item">
            <span className="signal-icon" aria-hidden="true">
              {iconFor(signal.kind)}
            </span>
            <div>
              <h3>{signal.title}</h3>
              <p>{signal.detail}</p>
              {signal.evidence.length ? <em>{signal.evidence.slice(0, 5).join(", ")}</em> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function iconFor(kind: string) {
  const normalized = kind.toLowerCase();
  if (normalized.includes("risk")) {
    return <ShieldAlert size={18} />;
  }
  if (normalized.includes("outlier")) {
    return <CircleAlert size={18} />;
  }
  if (normalized.includes("opportunity")) {
    return <Lightbulb size={18} />;
  }
  return <Activity size={18} />;
}

