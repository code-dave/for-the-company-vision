import { confidenceLabel } from "../lib/format";
import type { BigRock } from "../types";

type Props = {
  bigRocks: BigRock[];
};

export function BigRockList({ bigRocks }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Strategic clusters</p>
          <h2>Big rocks</h2>
        </div>
      </div>
      <div className="rock-list">
        {bigRocks.map((rock) => (
          <article className="rock-item" key={rock.id}>
            <div>
              <h3>{rock.title}</h3>
              <p>{rock.rationale}</p>
            </div>
            <div className="tag-row">
              <span>{rock.status}</span>
              <span>{confidenceLabel(rock.confidence)}</span>
              <span>{rock.issueKeys.length} issues</span>
            </div>
            <div className="small-rocks">
              {rock.smallRocks.slice(0, 4).map((small) => (
                <span key={small.id}>{small.title}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

