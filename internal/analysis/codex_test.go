package analysis

import (
	"strings"
	"testing"

	"github.com/code-dave/for-the-company-vision/internal/jira"
)

func TestCompactSnapshotDropsRawCustomNoiseAndTrimsText(t *testing.T) {
	longDescription := strings.Repeat("detail ", 400)
	snapshot := &jira.Snapshot{
		Project:    "DEMO",
		IssueCount: 1,
		Issues: []jira.Issue{
			{
				Key:         "DEMO-1",
				Summary:     strings.Repeat("summary ", 80),
				Description: longDescription,
				IssueType:   "Story",
				Status:      "To Do",
				Sprints: []string{
					"com.atlassian.greenhopper.service.sprint.Sprint@1dbc7bd5[id=92039,rapidViewId=11904,state=ACTIVE,name=SRE_CI Sprint 22,startDate=2026-03-26T10:40:00.000Z,endDate=2026-04-08T10:40:00.000Z]",
				},
				Custom: map[string]any{
					"Rank":                "0|i000ab:",
					"Massive Raw Payload": strings.Repeat("x", 5000),
				},
			},
		},
	}

	compact := compactSnapshot(snapshot)
	if len(compact.Issues) != 1 {
		t.Fatalf("expected one compact issue, got %d", len(compact.Issues))
	}
	issue := compact.Issues[0]
	if len(issue.Description) > descriptionLimit {
		t.Fatalf("description was not trimmed: %d", len(issue.Description))
	}
	if len(issue.Summary) > summaryLimit {
		t.Fatalf("summary was not trimmed: %d", len(issue.Summary))
	}
	if len(issue.Signals) != 1 || !strings.Contains(issue.Signals[0], "Rank") {
		t.Fatalf("expected only rank signal, got %#v", issue.Signals)
	}
	if len(issue.Sprints) != 1 || issue.Sprints[0] != "SRE_CI Sprint 22" {
		t.Fatalf("expected compact sprint name, got %#v", issue.Sprints)
	}
}

func TestCleanDescriptionRemovesJiraNotice(t *testing.T) {
	description := `"Important Notice: ** This ticket may contain sensitive information subject to policy and access restrictions. You are responsible for controlling access and distribution of this ticket." The actual request is to build the image pipeline.`
	cleaned := cleanDescription(description)
	if strings.Contains(strings.ToLower(cleaned), "important notice") {
		t.Fatalf("expected notice removed, got %q", cleaned)
	}
	if !strings.Contains(cleaned, "actual request") {
		t.Fatalf("expected useful description retained, got %q", cleaned)
	}
}
