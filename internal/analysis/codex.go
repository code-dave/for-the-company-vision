package analysis

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/code-dave/for-the-company-vision/internal/config"
	"github.com/code-dave/for-the-company-vision/internal/jira"
)

const (
	descriptionLimit = 420
	signalLimit      = 120
	summaryLimit     = 180
)

type Analyzer interface {
	Analyze(ctx context.Context, snapshot *jira.Snapshot) (*BoardAnalysis, error)
	Available(ctx context.Context) bool
}

type codexSnapshot struct {
	Project    string       `json:"project"`
	BaseURL    string       `json:"baseUrl"`
	PulledAt   time.Time    `json:"pulledAt"`
	IssueCount int          `json:"issueCount"`
	Issues     []codexIssue `json:"issues"`
}

type codexIssue struct {
	Key         string    `json:"key"`
	URL         string    `json:"url"`
	Summary     string    `json:"summary"`
	Description string    `json:"description,omitempty"`
	IssueType   string    `json:"issueType"`
	Status      string    `json:"status"`
	Priority    string    `json:"priority,omitempty"`
	Assignee    string    `json:"assignee,omitempty"`
	ParentKey   string    `json:"parentKey,omitempty"`
	EpicKey     string    `json:"epicKey,omitempty"`
	EpicName    string    `json:"epicName,omitempty"`
	StoryPoints float64   `json:"storyPoints,omitempty"`
	Labels      []string  `json:"labels,omitempty"`
	Components  []string  `json:"components,omitempty"`
	FixVersions []string  `json:"fixVersions,omitempty"`
	Sprints     []string  `json:"sprints,omitempty"`
	Created     time.Time `json:"created,omitempty"`
	Updated     time.Time `json:"updated,omitempty"`
	Signals     []string  `json:"signals,omitempty"`
}

type CodexAnalyzer struct {
	cfg config.CodexConfig
}

func NewCodexAnalyzer(cfg config.CodexConfig) *CodexAnalyzer {
	return &CodexAnalyzer{cfg: cfg}
}

func (a *CodexAnalyzer) Available(ctx context.Context) bool {
	cmd := exec.CommandContext(ctx, a.cfg.Bin, "--version")
	return cmd.Run() == nil
}

func (a *CodexAnalyzer) Analyze(ctx context.Context, snapshot *jira.Snapshot) (*BoardAnalysis, error) {
	if snapshot == nil {
		return nil, errors.New("jira snapshot is required")
	}
	if !a.Available(ctx) {
		return nil, fmt.Errorf("codex binary %q is not available", a.cfg.Bin)
	}

	payload, err := json.Marshal(compactSnapshot(snapshot))
	if err != nil {
		return nil, err
	}

	outputFile, err := os.CreateTemp("", "company-vision-codex-*.json")
	if err != nil {
		return nil, err
	}
	outputPath := outputFile.Name()
	_ = outputFile.Close()
	defer os.Remove(outputPath)

	args := []string{
		"exec",
		"--ephemeral",
		"--skip-git-repo-check",
		"--sandbox", "read-only",
		"--cd", a.cfg.WorkDir,
		"--output-schema", a.cfg.SchemaPath,
		"--output-last-message", outputPath,
		"--json",
		"--color", "never",
	}
	if a.cfg.Model != "" {
		args = append(args, "--model", a.cfg.Model)
	}
	args = append(args, "-")

	prompt := buildPrompt(snapshot.Project, payload)
	cmd := exec.CommandContext(ctx, a.cfg.Bin, args...)
	cmd.Dir = a.cfg.WorkDir
	cmd.Stdin = strings.NewReader(prompt)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("codex analysis failed: %w: %s", err, summarizeCodexError(stdout.String()+"\n"+stderr.String()))
	}

	response, err := os.ReadFile(outputPath)
	if err != nil {
		return nil, err
	}
	response = bytes.TrimSpace(response)
	if len(response) == 0 {
		return nil, errors.New("codex produced an empty analysis")
	}

	var analysis BoardAnalysis
	if err := json.Unmarshal(response, &analysis); err != nil {
		return nil, fmt.Errorf("parse codex analysis JSON: %w", err)
	}
	analysis.Project = snapshot.Project
	if analysis.GeneratedAt.IsZero() {
		analysis.GeneratedAt = time.Now().UTC()
	}
	if analysis.Model.Provider == "" {
		analysis.Model.Provider = "codex"
	}
	if analysis.Model.Model == "" {
		analysis.Model.Model = a.cfg.Model
	}
	if analysis.Metrics.TotalIssues == 0 {
		analysis.Metrics.TotalIssues = snapshot.IssueCount
	}
	if analysis.Metrics.LastJiraPullISO8601 == "" {
		analysis.Metrics.LastJiraPullISO8601 = snapshot.PulledAt.Format(time.RFC3339)
	}
	return &analysis, nil
}

func buildPrompt(project string, snapshot []byte) string {
	return fmt.Sprintf(`You are the analysis engine for The Company Vision.

Mission:
- Analyze this Jira project snapshot for project %s.
- Group work into "big rocks" and "small rocks".
- Identify outlier tasks that do not clearly align to the team's observable vision, epics, roadmap themes, or active delivery streams.
- Do not fetch Jira. Do not invent tickets. Use only the JSON snapshot below.
- Return only valid JSON matching the provided schema.

Analysis expectations:
- Big rocks are durable workstreams, epics, strategic outcomes, or repeated delivery themes.
- Small rocks are meaningful substreams under a big rock, backed by issue keys.
- Outliers should include tasks with weak thematic fit, unclear ownership, ambiguous summary/description, or isolated work that is not connected to the larger board.
- Explain reasoning with short, concrete evidence. Use issue keys in issueKeys/evidence fields.
- Prefer useful clustering over mirroring Jira's current epic structure when the text suggests a better team vision.
- Confidence is 0.0 to 1.0.
- Health score is 0 to 100 and measures how coherent the portfolio looks from the Jira data.
- Board node kinds must use "big-rock", "small-rock", or "outlier" when possible.

Jira snapshot JSON:
%s
`, project, string(snapshot))
}

func SchemaPath(root string) string {
	return filepath.Join(root, "schemas", "vision-analysis.schema.json")
}

func compactSnapshot(snapshot *jira.Snapshot) codexSnapshot {
	issues := make([]codexIssue, 0, len(snapshot.Issues))
	for _, issue := range snapshot.Issues {
		issues = append(issues, codexIssue{
			Key:         issue.Key,
			URL:         issue.URL,
			Summary:     truncate(issue.Summary, summaryLimit),
			Description: truncate(cleanDescription(issue.Description), descriptionLimit),
			IssueType:   issue.IssueType,
			Status:      issue.Status,
			Priority:    issue.Priority,
			Assignee:    issue.Assignee,
			ParentKey:   issue.ParentKey,
			EpicKey:     issue.EpicKey,
			EpicName:    issue.EpicName,
			StoryPoints: issue.StoryPoints,
			Labels:      compactStringList(issue.Labels, 6, 80),
			Components:  compactStringList(issue.Components, 6, 80),
			FixVersions: compactStringList(issue.FixVersions, 4, 80),
			Sprints:     compactSprints(issue.Sprints),
			Created:     issue.Created,
			Updated:     issue.Updated,
			Signals:     compactCustomSignals(issue.Custom),
		})
	}
	return codexSnapshot{
		Project:    snapshot.Project,
		BaseURL:    snapshot.BaseURL,
		PulledAt:   snapshot.PulledAt,
		IssueCount: snapshot.IssueCount,
		Issues:     issues,
	}
}

func compactCustomSignals(custom map[string]any) []string {
	if len(custom) == 0 {
		return nil
	}
	allow := []string{"theme", "vision", "objective", "okr", "goal", "team", "service", "customer", "severity", "roadmap", "portfolio", "rank"}
	signals := []string{}
	for key, value := range custom {
		normalized := strings.ToLower(key)
		keep := false
		for _, token := range allow {
			if strings.Contains(normalized, token) {
				keep = true
				break
			}
		}
		if !keep {
			continue
		}
		text := truncate(fmt.Sprint(value), signalLimit)
		if text == "" || text == "[]" || text == "<nil>" {
			continue
		}
		signals = append(signals, key+": "+text)
		if len(signals) >= 4 {
			break
		}
	}
	return signals
}

func compactStringList(values []string, maxItems, maxLength int) []string {
	if len(values) == 0 {
		return nil
	}
	out := make([]string, 0, min(len(values), maxItems))
	for _, value := range values {
		value = truncate(value, maxLength)
		if value == "" {
			continue
		}
		out = append(out, value)
		if len(out) >= maxItems {
			break
		}
	}
	return out
}

func compactSprints(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	out := make([]string, 0, min(len(values), 4))
	for _, value := range values {
		name := value
		if _, rest, ok := strings.Cut(value, "name="); ok {
			name, _, _ = strings.Cut(rest, ",")
		}
		name = truncate(name, 80)
		if name == "" || name == "<null>" {
			continue
		}
		out = append(out, name)
		if len(out) >= 4 {
			break
		}
	}
	return out
}

func cleanDescription(value string) string {
	value = strings.Join(strings.Fields(value), " ")
	lower := strings.ToLower(value)
	start := strings.Index(lower, "important notice:")
	endPhrase := "you are responsible for controlling access and distribution of this ticket."
	if start >= 0 {
		if end := strings.Index(lower[start:], endPhrase); end >= 0 {
			cutEnd := start + end + len(endPhrase)
			value = strings.TrimSpace(value[:start] + " " + value[cutEnd:])
		}
	}
	value = strings.Trim(value, `" `)
	return strings.TrimSpace(value)
}

func summarizeCodexError(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "no stderr"
	}
	if strings.Contains(value, "input_too_large") || strings.Contains(value, "Input exceeds the maximum length") {
		return "Codex rejected the request because the analysis payload is too large"
	}
	if index := strings.LastIndex(value, "\nError:"); index >= 0 {
		return truncate(value[index+1:], 1600)
	}
	if index := strings.LastIndex(value, "Error:"); index >= 0 {
		return truncate(value[index:], 1600)
	}
	if len(value) > 1600 {
		return "Codex failed; stderr tail: " + truncate(value[len(value)-1600:], 1600)
	}
	return value
}

func truncate(value string, limit int) string {
	value = strings.Join(strings.Fields(value), " ")
	if len(value) <= limit {
		return value
	}
	if limit <= 3 {
		return value[:limit]
	}
	return strings.TrimSpace(value[:limit-3]) + "..."
}
