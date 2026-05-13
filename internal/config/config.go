package config

import (
	"bufio"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	JiraBaseURL string        `json:"jiraBaseUrl"`
	JiraProject string        `json:"jiraProject"`
	JiraToken   string        `json:"-"`
	Port        int           `json:"port"`
	CacheDir    string        `json:"cacheDir"`
	JiraTimeout time.Duration `json:"-"`
	Codex       CodexConfig   `json:"codex"`
}

type CodexConfig struct {
	Bin        string        `json:"bin"`
	Model      string        `json:"model,omitempty"`
	Timeout    time.Duration `json:"-"`
	SchemaPath string        `json:"schemaPath"`
	WorkDir    string        `json:"workDir"`
}

func Load(root string) (Config, error) {
	if root == "" {
		root = "."
	}
	loadEnvFile(filepath.Join(root, ".env"), false)
	loadEnvFile(filepath.Join(root, ".env.local"), false)

	initialCacheDir := env("VISION_CACHE_DIR", filepath.Join(root, ".vision-cache"))
	if !filepath.IsAbs(initialCacheDir) {
		initialCacheDir = filepath.Join(root, initialCacheDir)
	}
	loadEnvFile(filepath.Join(initialCacheDir, "config.env"), true)

	port := envInt("VISION_PORT", 8787)
	cacheDir := env("VISION_CACHE_DIR", initialCacheDir)
	if !filepath.IsAbs(cacheDir) {
		cacheDir = filepath.Join(root, cacheDir)
	}

	cfg := Config{
		JiraBaseURL: NormalizeBaseURL(os.Getenv("JIRA_BASE_URL")),
		JiraProject: strings.ToUpper(strings.TrimSpace(env("JIRA_PROJECT", ""))),
		JiraToken:   strings.TrimSpace(os.Getenv("JIRA_TOKEN")),
		Port:        port,
		CacheDir:    cacheDir,
		JiraTimeout: envDuration("JIRA_TIMEOUT", 2*time.Minute),
		Codex: CodexConfig{
			Bin:        env("CODEX_BIN", "codex"),
			Model:      strings.TrimSpace(os.Getenv("CODEX_MODEL")),
			Timeout:    envDuration("CODEX_TIMEOUT", 8*time.Minute),
			SchemaPath: filepath.Join(root, "schemas", "vision-analysis.schema.json"),
			WorkDir:    root,
		},
	}

	return cfg, nil
}

type AppSettings struct {
	JiraBaseURL string `json:"jiraBaseUrl"`
	JiraProject string `json:"jiraProject"`
	JiraToken   string `json:"jiraToken,omitempty"`
	CodexBin    string `json:"codexBin"`
	CodexModel  string `json:"codexModel"`
	Port        int    `json:"port"`
	CacheDir    string `json:"cacheDir"`
}

type PublicSettings struct {
	JiraBaseURL    string `json:"jiraBaseUrl"`
	JiraProject    string `json:"jiraProject"`
	JiraTokenSaved bool   `json:"jiraTokenSaved"`
	CodexBin       string `json:"codexBin"`
	CodexModel     string `json:"codexModel"`
	Port           int    `json:"port"`
	CacheDir       string `json:"cacheDir"`
	ConfigPath     string `json:"configPath"`
}

func (cfg Config) PublicSettings() PublicSettings {
	return PublicSettings{
		JiraBaseURL:    cfg.JiraBaseURL,
		JiraProject:    cfg.JiraProject,
		JiraTokenSaved: cfg.JiraToken != "",
		CodexBin:       cfg.Codex.Bin,
		CodexModel:     cfg.Codex.Model,
		Port:           cfg.Port,
		CacheDir:       cfg.CacheDir,
		ConfigPath:     filepath.Join(cfg.CacheDir, "config.env"),
	}
}

func SaveAppSettings(path string, settings AppSettings) error {
	if strings.TrimSpace(settings.JiraBaseURL) == "" {
		return errors.New("Jira endpoint is required")
	}
	if strings.TrimSpace(settings.JiraProject) == "" {
		return errors.New("Jira project is required")
	}
	if strings.TrimSpace(settings.CodexBin) == "" {
		settings.CodexBin = "codex"
	}
	if settings.Port == 0 {
		settings.Port = 8787
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	lines := []string{
		"JIRA_BASE_URL=" + shellQuote(NormalizeBaseURL(settings.JiraBaseURL)),
		"JIRA_PROJECT=" + shellQuote(strings.ToUpper(strings.TrimSpace(settings.JiraProject))),
		"CODEX_BIN=" + shellQuote(strings.TrimSpace(settings.CodexBin)),
		"CODEX_MODEL=" + shellQuote(strings.TrimSpace(settings.CodexModel)),
		"VISION_PORT=" + strconv.Itoa(settings.Port),
	}
	if strings.TrimSpace(settings.CacheDir) != "" {
		lines = append(lines, "VISION_CACHE_DIR="+shellQuote(strings.TrimSpace(settings.CacheDir)))
	}
	if strings.TrimSpace(settings.JiraToken) != "" {
		lines = append(lines, "JIRA_TOKEN="+shellQuote(strings.TrimSpace(settings.JiraToken)))
	}
	content := strings.Join(lines, "\n") + "\n"
	return os.WriteFile(path, []byte(content), 0o600)
}

func shellQuote(value string) string {
	return fmt.Sprintf("%q", value)
}

func loadEnvFile(path string, override bool) {
	values, err := ReadEnvFile(path)
	if err != nil {
		return
	}
	for key, value := range values {
		if _, exists := os.LookupEnv(key); override || !exists {
			_ = os.Setenv(key, value)
		}
	}
}

func ReadEnvFile(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		if key == "" {
			continue
		}
		values[key] = value
	}
	return values, scanner.Err()
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err == nil {
		return parsed
	}
	seconds, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}

func NormalizeBaseURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if !strings.Contains(value, "://") {
		value = "https://" + value
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return strings.TrimRight(value, "/")
	}
	return parsed.Scheme + "://" + parsed.Host
}

func normalizeBaseURL(value string) string {
	return NormalizeBaseURL(value)
}
