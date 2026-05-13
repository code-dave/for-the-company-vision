package jira

import (
	"context"
	"net/http"
	"net/http/httptest"
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
		"customfield_10001": "DEMO-1",
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
		Key:    "DEMO-2",
		Fields: fields,
	}, fieldNames, detectFieldsFromNames(fieldNames))

	if issue.Key != "DEMO-2" {
		t.Fatalf("expected key DEMO-2, got %q", issue.Key)
	}
	if issue.EpicKey != "DEMO-1" {
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

func TestListProjectsUsesSearchEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/api/2/project/search" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("query"); got != "road" {
			t.Fatalf("query = %q, expected %q", got, "road")
		}
		if got := r.Header.Get("Authorization"); got != "Bearer token" {
			t.Fatalf("authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"values":[{"id":"1","key":"ROAD","name":"Roadmap Work","projectTypeKey":"software"},{"id":"2","key":"ABC","name":"Alpha Beta","projectTypeKey":"business"}]}`))
	}))
	defer server.Close()

	client, err := NewClient(server.URL, "token")
	if err != nil {
		t.Fatal(err)
	}

	projects, err := client.ListProjects(context.Background(), "road", 25)
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 1 {
		t.Fatalf("len(projects) = %d, expected 1", len(projects))
	}
	if projects[0].Key != "ROAD" || projects[0].Name != "Roadmap Work" {
		t.Fatalf("unexpected project: %#v", projects[0])
	}
}

func TestListProjectsFallsBackToProjectList(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/rest/api/2/project/search":
			http.NotFound(w, r)
		case "/rest/api/2/project":
			_, _ = w.Write([]byte(`[{"id":"1","key":"PLAT","name":"Platform Work","projectTypeKey":"software"},{"id":"2","key":"OPS","name":"Operations","projectTypeKey":"service_desk"}]`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client, err := NewClient(server.URL, "token")
	if err != nil {
		t.Fatal(err)
	}

	projects, err := client.ListProjects(context.Background(), "platform", 25)
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 1 {
		t.Fatalf("len(projects) = %d, expected 1", len(projects))
	}
	if projects[0].Key != "PLAT" {
		t.Fatalf("project key = %q, expected PLAT", projects[0].Key)
	}
}
