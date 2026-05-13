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

type Analyzer interface {
	Analyze(ctx context.Context, snapshot *jira.Snapshot) (*BoardAnalysis, error)
	Available(ctx context.Context) bool
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

	payload, err := json.Marshal(snapshot)
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
	}
	if a.cfg.Model != "" {
		args = append(args, "--model", a.cfg.Model)
	}
	args = append(args, "-")

	prompt := buildPrompt(snapshot.Project, payload)
	cmd := exec.CommandContext(ctx, a.cfg.Bin, args...)
	cmd.Dir = a.cfg.WorkDir
	cmd.Stdin = strings.NewReader(prompt)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("codex analysis failed: %w: %s", err, strings.TrimSpace(stderr.String()))
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
	return fmt.Sprintf(`You are the analysis engine for Company Vision Studio.

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
