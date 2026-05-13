package config

import (
	"bufio"
	"errors"
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
	loadEnvFile(filepath.Join(root, ".env"))
	loadEnvFile(filepath.Join(root, ".env.local"))

	port := envInt("VISION_PORT", 8787)
	cacheDir := env("VISION_CACHE_DIR", filepath.Join(root, ".vision-cache"))
	if !filepath.IsAbs(cacheDir) {
		cacheDir = filepath.Join(root, cacheDir)
	}

	cfg := Config{
		JiraBaseURL: normalizeBaseURL(os.Getenv("JIRA_BASE_URL")),
		JiraProject: strings.ToUpper(strings.TrimSpace(env("JIRA_PROJECT", "OHAIFSRE"))),
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

	if cfg.JiraBaseURL == "" {
		return Config{}, errors.New("JIRA_BASE_URL is required")
	}
	return cfg, nil
}

func loadEnvFile(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

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
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
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

func normalizeBaseURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return strings.TrimRight(value, "/")
}
