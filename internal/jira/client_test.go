package jira

import (
	"testing"
)

func TestNormalizeIssueDetectsCommonFields(t *testing.T) {
	fields := map[string]any{
		"summary":           "Make the board useful",
		"description":       "Group work by outcomes",
		"issuetype":         map[string]any{"name": "Story"},
		"status":            map[string]any{"name": "In Progress"},
		"priority":          map[string]any{"name": "High"},
		"assignee":          map[string]any{"displayName": "Ada Lovelace"},
		"labels":            []any{"vision", "jira"},
		"components":        []any{map[string]any{"name": "Reporting"}},
		"customfield_10001": "OHAIFSRE-1",
		"customfield_10002": float64(5),
		"customfield_10003": "Vision platform",
	}
	fieldNames := map[string]string{
		"customfield_10001": "Epic Link",
		"customfield_10002": "Story Points",
		"customfield_10003": "Epic Name",
	}

	issue := normalizeIssue("https://jira.example.com", rawIssue{
		ID:     "10000",
		Key:    "OHAIFSRE-2",
		Fields: fields,
	}, fieldNames, detectFieldsFromNames(fieldNames))

	if issue.Key != "OHAIFSRE-2" {
		t.Fatalf("expected key OHAIFSRE-2, got %q", issue.Key)
	}
	if issue.EpicKey != "OHAIFSRE-1" {
		t.Fatalf("expected epic link, got %q", issue.EpicKey)
	}
	if issue.StoryPoints != 5 {
		t.Fatalf("expected story points 5, got %f", issue.StoryPoints)
	}
	if issue.Assignee != "Ada Lovelace" {
		t.Fatalf("expected assignee, got %q", issue.Assignee)
	}
	if issue.Custom["Epic Name"] != "Vision platform" {
		t.Fatalf("expected custom epic name to be retained, got %#v", issue.Custom)
	}
}
