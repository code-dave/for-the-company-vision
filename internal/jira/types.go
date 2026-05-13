package jira

import "time"

type Snapshot struct {
	Project       string            `json:"project"`
	BaseURL       string            `json:"baseUrl"`
	PulledAt      time.Time         `json:"pulledAt"`
	IssueCount    int               `json:"issueCount"`
	Issues        []Issue           `json:"issues"`
	FieldNames    map[string]string `json:"fieldNames,omitempty"`
	DetectedField DetectedFields    `json:"detectedFields"`
}

type Issue struct {
	ID          string         `json:"id"`
	Key         string         `json:"key"`
	URL         string         `json:"url"`
	Summary     string         `json:"summary"`
	Description string         `json:"description,omitempty"`
	IssueType   string         `json:"issueType"`
	Status      string         `json:"status"`
	Priority    string         `json:"priority,omitempty"`
	Assignee    string         `json:"assignee,omitempty"`
	Reporter    string         `json:"reporter,omitempty"`
	ParentKey   string         `json:"parentKey,omitempty"`
	EpicKey     string         `json:"epicKey,omitempty"`
	EpicName    string         `json:"epicName,omitempty"`
	StoryPoints float64        `json:"storyPoints,omitempty"`
	Labels      []string       `json:"labels,omitempty"`
	Components  []string       `json:"components,omitempty"`
	FixVersions []string       `json:"fixVersions,omitempty"`
	Sprints     []string       `json:"sprints,omitempty"`
	Created     time.Time      `json:"created,omitempty"`
	Updated     time.Time      `json:"updated,omitempty"`
	Custom      map[string]any `json:"custom,omitempty"`
}

type DetectedFields struct {
	EpicLink    string `json:"epicLink,omitempty"`
	EpicName    string `json:"epicName,omitempty"`
	ParentLink  string `json:"parentLink,omitempty"`
	StoryPoints string `json:"storyPoints,omitempty"`
	Sprint      string `json:"sprint,omitempty"`
}

type Project struct {
	ID             string `json:"id,omitempty"`
	Key            string `json:"key"`
	Name           string `json:"name"`
	ProjectTypeKey string `json:"projectTypeKey,omitempty"`
	LeadName       string `json:"leadName,omitempty"`
	AvatarURL      string `json:"avatarUrl,omitempty"`
}
