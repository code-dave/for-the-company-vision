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

type projectSearchResponse struct {
	Values []rawProject `json:"values"`
}

type rawIssue struct {
	ID     string         `json:"id"`
	Key    string         `json:"key"`
	Self   string         `json:"self"`
	Fields map[string]any `json:"fields"`
}

type rawProject struct {
	ID             string            `json:"id"`
	Key            string            `json:"key"`
	Name           string            `json:"name"`
	ProjectTypeKey string            `json:"projectTypeKey"`
	Lead           map[string]any    `json:"lead"`
	AvatarURLs     map[string]string `json:"avatarUrls"`
}

type HTTPError struct {
	StatusCode int
	Status     string
	Body       string
}

func (e *HTTPError) Error() string {
	if strings.TrimSpace(e.Body) == "" {
		return fmt.Sprintf("jira returned %s", e.Status)
	}
	return fmt.Sprintf("jira returned %s: %s", e.Status, strings.TrimSpace(e.Body))
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

func (c *Client) ListProjects(ctx context.Context, query string, limit int) ([]Project, error) {
	if limit <= 0 {
		limit = 25
	}

	projects, err := c.searchProjects(ctx, query, limit)
	if err == nil {
		return filterProjects(projects, query, limit), nil
	}
	if !isHTTPStatus(err, http.StatusBadRequest, http.StatusNotFound, http.StatusMethodNotAllowed) {
		return nil, fmt.Errorf("search jira projects: %w", err)
	}

	projects, err = c.allProjects(ctx)
	if err != nil {
		return nil, fmt.Errorf("list jira projects: %w", err)
	}
	return filterProjects(projects, query, limit), nil
}

func (c *Client) FetchProject(ctx context.Context, project string) (*Snapshot, error) {
	return c.FetchProjectWithProgress(ctx, project, nil)
}

func (c *Client) FetchProjectWithProgress(ctx context.Context, project string, progress ProgressFunc) (*Snapshot, error) {
	project = strings.ToUpper(strings.TrimSpace(project))
	if project == "" {
		return nil, errors.New("jira project is required")
	}

	emitProgress(progress, FetchProgress{
		Stage:   "prepare",
		Message: fmt.Sprintf("Preparing Jira sync for project %s", project),
		Percent: 1,
	})
	emitProgress(progress, FetchProgress{
		Stage:   "fields",
		Message: "Fetching Jira field metadata",
		Percent: 4,
	})
	fields, err := c.fetchFields(ctx)
	if err != nil {
		return nil, err
	}
	emitProgress(progress, FetchProgress{
		Stage:   "fields",
		Message: fmt.Sprintf("Loaded %d Jira field definitions", len(fields)),
		Percent: 10,
	})
	fieldNames := map[string]string{}
	for _, field := range fields {
		fieldNames[field.ID] = field.Name
	}
	detected := detectFields(fields)

	const pageSize = 100
	var all []Issue
	total := 1
	for startAt := 0; startAt < total; startAt += pageSize {
		page := startAt/pageSize + 1
		emitProgress(progress, FetchProgress{
			Stage:   "search",
			Message: fmt.Sprintf("Requesting Jira issue page %d, starting at issue %d", page, startAt+1),
			Percent: syncPercent(len(all), total),
			Pulled:  len(all),
			Total:   total,
			Page:    page,
		})
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
		emitProgress(progress, FetchProgress{
			Stage:   "pull",
			Message: fmt.Sprintf("Fetched %d issues from page %d; %d of %d issues pulled", len(response.Issues), page, len(all), total),
			Percent: syncPercent(len(all), total),
			Pulled:  len(all),
			Total:   total,
			Page:    page,
		})
		if len(response.Issues) == 0 {
			break
		}
	}

	emitProgress(progress, FetchProgress{
		Stage:   "normalize",
		Message: fmt.Sprintf("Sorting and preparing %d normalized issues for local cache", len(all)),
		Percent: 94,
		Pulled:  len(all),
		Total:   total,
	})
	sort.Slice(all, func(i, j int) bool {
		return all[i].Updated.After(all[j].Updated)
	})

	snapshot := &Snapshot{
		Project:       project,
		BaseURL:       c.baseURL,
		PulledAt:      time.Now().UTC(),
		IssueCount:    len(all),
		Issues:        all,
		FieldNames:    fieldNames,
		DetectedField: detected,
	}
	emitProgress(progress, FetchProgress{
		Stage:   "complete",
		Message: fmt.Sprintf("Jira pull complete with %d issues", snapshot.IssueCount),
		Percent: 98,
		Pulled:  snapshot.IssueCount,
		Total:   total,
	})
	return snapshot, nil
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

func (c *Client) searchProjects(ctx context.Context, query string, limit int) ([]rawProject, error) {
	params := url.Values{}
	params.Set("maxResults", strconv.Itoa(limit))
	if strings.TrimSpace(query) != "" {
		params.Set("query", strings.TrimSpace(query))
	}

	var response projectSearchResponse
	path := "/rest/api/2/project/search?" + params.Encode()
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &response); err != nil {
		return nil, err
	}
	return response.Values, nil
}

func (c *Client) allProjects(ctx context.Context) ([]rawProject, error) {
	var projects []rawProject
	if err := c.doJSON(ctx, http.MethodGet, "/rest/api/2/project", nil, &projects); err != nil {
		return nil, err
	}
	return projects, nil
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
		return &HTTPError{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			Body:       strings.TrimSpace(string(responseBody)),
		}
	}

	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func isHTTPStatus(err error, statuses ...int) bool {
	var httpErr *HTTPError
	if !errors.As(err, &httpErr) {
		return false
	}
	for _, status := range statuses {
		if httpErr.StatusCode == status {
			return true
		}
	}
	return false
}

func emitProgress(progress ProgressFunc, event FetchProgress) {
	if progress == nil {
		return
	}
	progress(event)
}

func syncPercent(pulled, total int) int {
	if total <= 0 {
		return 90
	}
	percent := 15 + int((float64(pulled)/float64(total))*75)
	if percent < 15 {
		return 15
	}
	if percent > 90 {
		return 90
	}
	return percent
}

func filterProjects(rawProjects []rawProject, query string, limit int) []Project {
	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	results := make([]Project, 0, len(rawProjects))
	seen := map[string]bool{}
	for _, rawProject := range rawProjects {
		project := normalizeProject(rawProject)
		if project.Key == "" || seen[project.Key] {
			continue
		}
		if normalizedQuery != "" {
			key := strings.ToLower(project.Key)
			name := strings.ToLower(project.Name)
			projectType := strings.ToLower(project.ProjectTypeKey)
			if !strings.Contains(key, normalizedQuery) && !strings.Contains(name, normalizedQuery) && !strings.Contains(projectType, normalizedQuery) {
				continue
			}
		}
		seen[project.Key] = true
		results = append(results, project)
	}

	sort.SliceStable(results, func(i, j int) bool {
		leftKey := strings.ToLower(results[i].Key)
		rightKey := strings.ToLower(results[j].Key)
		if normalizedQuery != "" {
			leftPrefix := strings.HasPrefix(leftKey, normalizedQuery)
			rightPrefix := strings.HasPrefix(rightKey, normalizedQuery)
			if leftPrefix != rightPrefix {
				return leftPrefix
			}
			leftNamePrefix := strings.HasPrefix(strings.ToLower(results[i].Name), normalizedQuery)
			rightNamePrefix := strings.HasPrefix(strings.ToLower(results[j].Name), normalizedQuery)
			if leftNamePrefix != rightNamePrefix {
				return leftNamePrefix
			}
		}
		return leftKey < rightKey
	})

	if len(results) > limit {
		return results[:limit]
	}
	return results
}

func normalizeProject(raw rawProject) Project {
	project := Project{
		ID:             raw.ID,
		Key:            strings.ToUpper(strings.TrimSpace(raw.Key)),
		Name:           strings.TrimSpace(raw.Name),
		ProjectTypeKey: strings.TrimSpace(raw.ProjectTypeKey),
		LeadName:       projectLeadName(raw.Lead),
	}
	for _, size := range []string{"48x48", "32x32", "24x24", "16x16"} {
		if avatarURL := strings.TrimSpace(raw.AvatarURLs[size]); avatarURL != "" {
			project.AvatarURL = avatarURL
			break
		}
	}
	return project
}

func projectLeadName(lead map[string]any) string {
	for _, key := range []string{"displayName", "name", "key"} {
		if value := stringValue(lead[key]); value != "" {
			return value
		}
	}
	return ""
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
