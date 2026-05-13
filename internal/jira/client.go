package jira

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

type fieldMeta struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Custom bool   `json:"custom"`
}

type searchResponse struct {
	StartAt    int                  `json:"startAt"`
	MaxResults int                  `json:"maxResults"`
	Total      int                  `json:"total"`
	Issues     []rawIssue           `json:"issues"`
	Names      map[string]string    `json:"names"`
	Schema     map[string]fieldMeta `json:"schema"`
}

type rawIssue struct {
	ID     string         `json:"id"`
	Key    string         `json:"key"`
	Self   string         `json:"self"`
	Fields map[string]any `json:"fields"`
}

func NewClient(baseURL, token string) (*Client, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return nil, errors.New("jira base URL is required")
	}
	if strings.TrimSpace(token) == "" {
		return nil, errors.New("JIRA_TOKEN is required")
	}
	return &Client{
		baseURL: baseURL,
		token:   strings.TrimSpace(token),
		httpClient: &http.Client{
			Timeout: 90 * time.Second,
		},
	}, nil
}

func (c *Client) FetchProject(ctx context.Context, project string) (*Snapshot, error) {
	project = strings.ToUpper(strings.TrimSpace(project))
	if project == "" {
		return nil, errors.New("jira project is required")
	}

	fields, err := c.fetchFields(ctx)
	if err != nil {
		return nil, err
	}
	fieldNames := map[string]string{}
	for _, field := range fields {
		fieldNames[field.ID] = field.Name
	}
	detected := detectFields(fields)

	const pageSize = 100
	var all []Issue
	total := 1
	for startAt := 0; startAt < total; startAt += pageSize {
		response, err := c.search(ctx, project, startAt, pageSize)
		if err != nil {
			return nil, err
		}
		total = response.Total
		if len(response.Names) > 0 {
			for id, name := range response.Names {
				fieldNames[id] = name
			}
			detected = detectFieldsFromNames(fieldNames)
		}
		for _, issue := range response.Issues {
			all = append(all, normalizeIssue(c.baseURL, issue, fieldNames, detected))
		}
		if len(response.Issues) == 0 {
			break
		}
	}

	sort.Slice(all, func(i, j int) bool {
		return all[i].Updated.After(all[j].Updated)
	})

	return &Snapshot{
		Project:       project,
		BaseURL:       c.baseURL,
		PulledAt:      time.Now().UTC(),
		IssueCount:    len(all),
		Issues:        all,
		FieldNames:    fieldNames,
		DetectedField: detected,
	}, nil
}

func (c *Client) fetchFields(ctx context.Context) ([]fieldMeta, error) {
	var fields []fieldMeta
	if err := c.doJSON(ctx, http.MethodGet, "/rest/api/2/field", nil, &fields); err != nil {
		return nil, fmt.Errorf("fetch jira fields: %w", err)
	}
	return fields, nil
}

func (c *Client) search(ctx context.Context, project string, startAt, maxResults int) (*searchResponse, error) {
	body := map[string]any{
		"jql":        fmt.Sprintf("project = %s ORDER BY updated DESC", project),
		"startAt":    startAt,
		"maxResults": maxResults,
		"fields":     []string{"*all"},
	}
	var response searchResponse
	path := "/rest/api/2/search?expand=names,schema"
	if err := c.doJSON(ctx, http.MethodPost, path, body, &response); err != nil {
		return nil, fmt.Errorf("search jira issues: %w", err)
	}
	return &response, nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}

	endpoint, err := url.JoinPath(c.baseURL, strings.TrimPrefix(path, "/"))
	if err != nil {
		return err
	}
	if strings.Contains(path, "?") {
		endpoint = c.baseURL + path
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("jira returned %s: %s", resp.Status, strings.TrimSpace(string(responseBody)))
	}

	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func detectFields(fields []fieldMeta) DetectedFields {
	names := map[string]string{}
	for _, field := range fields {
		names[field.ID] = field.Name
	}
	return detectFieldsFromNames(names)
}

func detectFieldsFromNames(names map[string]string) DetectedFields {
	var detected DetectedFields
	for id, name := range names {
		normalized := strings.ToLower(strings.TrimSpace(name))
		switch normalized {
		case "epic link":
			detected.EpicLink = id
		case "epic name":
			detected.EpicName = id
		case "parent link":
			detected.ParentLink = id
		case "story points", "story point estimate", "story points estimate":
			detected.StoryPoints = id
		case "sprint":
			detected.Sprint = id
		}
	}
	return detected
}

func normalizeIssue(baseURL string, raw rawIssue, fieldNames map[string]string, detected DetectedFields) Issue {
	fields := raw.Fields
	issue := Issue{
		ID:          raw.ID,
		Key:         raw.Key,
		URL:         fmt.Sprintf("%s/browse/%s", baseURL, raw.Key),
		Summary:     stringValue(fields["summary"]),
		Description: textValue(fields["description"]),
		IssueType:   nestedName(fields["issuetype"]),
		Status:      nestedName(fields["status"]),
		Priority:    nestedName(fields["priority"]),
		Assignee:    personName(fields["assignee"]),
		Reporter:    personName(fields["reporter"]),
		Labels:      stringList(fields["labels"]),
		Components:  nameList(fields["components"]),
		FixVersions: nameList(fields["fixVersions"]),
		Created:     parseJiraTime(fields["created"]),
		Updated:     parseJiraTime(fields["updated"]),
		Custom:      map[string]any{},
	}

	if parentKey := nestedKey(fields["parent"]); parentKey != "" {
		issue.ParentKey = parentKey
	}
	if detected.ParentLink != "" && issue.ParentKey == "" {
		issue.ParentKey = stringValue(fields[detected.ParentLink])
	}
	if detected.EpicLink != "" {
		issue.EpicKey = stringValue(fields[detected.EpicLink])
	}
	if detected.EpicName != "" {
		issue.EpicName = stringValue(fields[detected.EpicName])
	}
	if detected.StoryPoints != "" {
		issue.StoryPoints = numericValue(fields[detected.StoryPoints])
	}
	if detected.Sprint != "" {
		issue.Sprints = sprintList(fields[detected.Sprint])
	}
	if strings.EqualFold(issue.IssueType, "Epic") && issue.EpicKey == "" {
		issue.EpicKey = issue.Key
	}

	for id, value := range fields {
		if !strings.HasPrefix(id, "customfield_") {
			continue
		}
		name := fieldNames[id]
		if name == "" {
			name = id
		}
		simplified := simplifyValue(value)
		if simplified != nil && simplified != "" {
			issue.Custom[name] = simplified
		}
	}
	if len(issue.Custom) == 0 {
		issue.Custom = nil
	}
	return issue
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return textValue(value)
	}
}

func textValue(value any) string {
	if value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any:
		if text := collectText(typed); text != "" {
			return text
		}
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := textValue(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, " ")
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(payload)
}

func collectText(value map[string]any) string {
	parts := []string{}
	if text, ok := value["text"].(string); ok {
		parts = append(parts, text)
	}
	if content, ok := value["content"].([]any); ok {
		for _, item := range content {
			if nested, ok := item.(map[string]any); ok {
				if text := collectText(nested); text != "" {
					parts = append(parts, text)
				}
			}
		}
	}
	return strings.Join(parts, " ")
}

func nestedName(value any) string {
	if obj, ok := value.(map[string]any); ok {
		return stringValue(obj["name"])
	}
	return ""
}

func nestedKey(value any) string {
	if obj, ok := value.(map[string]any); ok {
		return stringValue(obj["key"])
	}
	return ""
}

func personName(value any) string {
	if obj, ok := value.(map[string]any); ok {
		for _, key := range []string{"displayName", "name", "emailAddress"} {
			if text := stringValue(obj[key]); text != "" {
				return text
			}
		}
	}
	return ""
}

func stringList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if text := stringValue(item); text != "" {
			out = append(out, text)
		}
	}
	return out
}

func nameList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if text := nestedName(item); text != "" {
			out = append(out, text)
		}
	}
	return out
}

func sprintList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		if text := stringValue(value); text != "" {
			return []string{text}
		}
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if text := stringValue(item); text != "" {
			out = append(out, text)
		}
	}
	return out
}

func numericValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case string:
		parsed, _ := strconv.ParseFloat(typed, 64)
		return parsed
	default:
		return 0
	}
}

func parseJiraTime(value any) time.Time {
	text := stringValue(value)
	if text == "" {
		return time.Time{}
	}
	formats := []string{
		"2006-01-02T15:04:05.000-0700",
		"2006-01-02T15:04:05.000Z0700",
		time.RFC3339,
	}
	for _, format := range formats {
		parsed, err := time.Parse(format, text)
		if err == nil {
			return parsed.UTC()
		}
	}
	return time.Time{}
}

func simplifyValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string, float64, bool:
		return typed
	case []any:
		values := make([]any, 0, len(typed))
		for _, item := range typed {
			simplified := simplifyValue(item)
			if simplified != nil && simplified != "" {
				values = append(values, simplified)
			}
		}
		return values
	case map[string]any:
		for _, key := range []string{"name", "value", "displayName", "key"} {
			if text := stringValue(typed[key]); text != "" {
				return text
			}
		}
		if text := collectText(typed); text != "" {
			return text
		}
		return typed
	default:
		return typed
	}
}
