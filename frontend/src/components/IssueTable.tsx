import { formatDate } from "../lib/format";
import type { Issue } from "../types";

type Props = {
  issues: Issue[];
};

export function IssueTable({ issues }: Props) {
  return (
    <section className="panel issue-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Jira source</p>
          <h2>Recently updated issues</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Summary</th>
              <th>Type</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Epic</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {issues.slice(0, 80).map((issue) => (
              <tr id={`issue-${issue.key}`} key={issue.key}>
                <td>
                  <a href={issue.url} target="_blank" rel="noreferrer">
                    {issue.key}
                  </a>
                </td>
                <td>{issue.summary}</td>
                <td>{issue.issueType}</td>
                <td>{issue.status}</td>
                <td>{issue.assignee || "Unassigned"}</td>
                <td>{issue.epicKey || issue.parentKey || ""}</td>
                <td>{formatDate(issue.updated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

