package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/code-dave/for-the-company-vision/internal/analysis"
	"github.com/code-dave/for-the-company-vision/internal/config"
	"github.com/code-dave/for-the-company-vision/internal/jira"
	"github.com/code-dave/for-the-company-vision/internal/store"
)

type Server struct {
	cfg      config.Config
	jira     *jira.Client
	analyzer analysis.Analyzer
	cache    *store.Cache
}

type HealthResponse struct {
	Status          string `json:"status"`
	JiraConfigured  bool   `json:"jiraConfigured"`
	DefaultProject  string `json:"defaultProject"`
	CodexConfigured bool   `json:"codexConfigured"`
	CodexBin        string `json:"codexBin"`
	Port            int    `json:"port"`
}

type projectRequest struct {
	Project   string `json:"project"`
	ForceSync bool   `json:"forceSync"`
}

type updateSettingsRequest struct {
	JiraBaseURL string `json:"jiraBaseUrl"`
	JiraProject string `json:"jiraProject"`
	JiraToken   string `json:"jiraToken"`
	CodexBin    string `json:"codexBin"`
	CodexModel  string `json:"codexModel"`
	Port        int    `json:"port"`
	CacheDir    string `json:"cacheDir"`
}

func NewServer(cfg config.Config, jiraClient *jira.Client, analyzer analysis.Analyzer, cache *store.Cache) *Server {
	return &Server{cfg: cfg, jira: jiraClient, analyzer: analyzer, cache: cache}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/config", s.handleConfig)
	mux.HandleFunc("POST /api/config", s.handleUpdateConfig)
	mux.HandleFunc("POST /api/sync", s.handleSync)
	mux.HandleFunc("GET /api/snapshot", s.handleGetSnapshot)
	mux.HandleFunc("POST /api/analyze", s.handleAnalyze)
	mux.HandleFunc("GET /api/analysis", s.handleGetAnalysis)
	mux.HandleFunc("/", s.handleStatic)
	return withCORS(mux)
}

func (s *Server) Health() HealthResponse {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return HealthResponse{
		Status:          "ok",
		JiraConfigured:  s.cfg.JiraBaseURL != "" && s.cfg.JiraToken != "",
		DefaultProject:  s.cfg.JiraProject,
		CodexConfigured: s.analyzer != nil && s.analyzer.Available(ctx),
		CodexBin:        s.cfg.Codex.Bin,
		Port:            s.cfg.Port,
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.Health())
}

func (s *Server) handleConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.cfg.PublicSettings())
}

func (s *Server) handleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req updateSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	configPath := filepath.Join(s.cfg.CacheDir, "config.env")
	currentValues, _ := config.ReadEnvFile(configPath)
	token := strings.TrimSpace(req.JiraToken)
	if token == "" {
		token = currentValues["JIRA_TOKEN"]
		if token == "" {
			token = s.cfg.JiraToken
		}
	}

	settings := config.AppSettings{
		JiraBaseURL: req.JiraBaseURL,
		JiraProject: req.JiraProject,
		JiraToken:   token,
		CodexBin:    req.CodexBin,
		CodexModel:  req.CodexModel,
		Port:        req.Port,
		CacheDir:    req.CacheDir,
	}
	if settings.CacheDir == "" {
		settings.CacheDir = s.cfg.CacheDir
	}

	if err := config.SaveAppSettings(configPath, settings); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	nextCfg := s.cfg
	nextCfg.JiraBaseURL = strings.TrimRight(strings.TrimSpace(settings.JiraBaseURL), "/")
	nextCfg.JiraProject = strings.ToUpper(strings.TrimSpace(settings.JiraProject))
	nextCfg.JiraToken = token
	nextCfg.Codex.Bin = strings.TrimSpace(settings.CodexBin)
	if nextCfg.Codex.Bin == "" {
		nextCfg.Codex.Bin = "codex"
	}
	nextCfg.Codex.Model = strings.TrimSpace(settings.CodexModel)
	if settings.Port != 0 {
		nextCfg.Port = settings.Port
	}
	if settings.CacheDir != "" {
		nextCfg.CacheDir = settings.CacheDir
	}

	s.cfg = nextCfg
	if jiraClient, err := jira.NewClient(nextCfg.JiraBaseURL, nextCfg.JiraToken); err == nil {
		s.jira = jiraClient
	}
	s.analyzer = analysis.NewCodexAnalyzer(nextCfg.Codex)
	s.cache = store.New(nextCfg.CacheDir)

	writeJSON(w, http.StatusOK, s.cfg.PublicSettings())
}

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	req, err := decodeProjectRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	project := s.project(req.Project)
	if project == "" {
		writeError(w, http.StatusBadRequest, errors.New("project is required"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.JiraTimeout)
	defer cancel()
	if s.jira == nil {
		writeError(w, http.StatusBadRequest, errors.New("Jira is not configured; save endpoint and token in setup"))
		return
	}
	snapshot, err := s.jira.FetchProject(ctx, project)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if err := s.cache.SaveSnapshot(snapshot); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, snapshot)
}

func (s *Server) handleGetSnapshot(w http.ResponseWriter, r *http.Request) {
	project := s.project(r.URL.Query().Get("project"))
	snapshot, err := s.cache.LoadSnapshot(project)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Errorf("no cached snapshot for %s; run sync first", project))
		return
	}
	writeJSON(w, http.StatusOK, snapshot)
}

func (s *Server) handleAnalyze(w http.ResponseWriter, r *http.Request) {
	req, err := decodeProjectRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	project := s.project(req.Project)
	if project == "" {
		writeError(w, http.StatusBadRequest, errors.New("project is required"))
		return
	}

	var snapshot *jira.Snapshot
	if req.ForceSync {
		ctx, cancel := context.WithTimeout(r.Context(), s.cfg.JiraTimeout)
		defer cancel()
		if s.jira == nil {
			writeError(w, http.StatusBadRequest, errors.New("Jira is not configured; save endpoint and token in setup"))
			return
		}
		snapshot, err = s.jira.FetchProject(ctx, project)
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		if err := s.cache.SaveSnapshot(snapshot); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
	} else {
		snapshot, err = s.cache.LoadSnapshot(project)
		if err != nil {
			writeError(w, http.StatusNotFound, fmt.Errorf("no cached snapshot for %s; sync Jira before analysis", project))
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.Codex.Timeout)
	defer cancel()
	result, err := s.analyzer.Analyze(ctx, snapshot)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if err := s.cache.SaveAnalysis(result); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleGetAnalysis(w http.ResponseWriter, r *http.Request) {
	project := s.project(r.URL.Query().Get("project"))
	result, err := s.cache.LoadAnalysis(project)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Errorf("no cached analysis for %s; run Codex analysis first", project))
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	dist := filepath.Join(s.cfg.Codex.WorkDir, "frontend", "dist")
	if _, err := os.Stat(filepath.Join(dist, "index.html")); err != nil {
		http.NotFound(w, r)
		return
	}
	http.FileServer(http.Dir(dist)).ServeHTTP(w, r)
}

func (s *Server) project(project string) string {
	project = strings.ToUpper(strings.TrimSpace(project))
	if project == "" {
		return s.cfg.JiraProject
	}
	return project
}

func decodeProjectRequest(r *http.Request) (projectRequest, error) {
	defer r.Body.Close()
	var req projectRequest
	if r.Body == nil {
		return req, nil
	}
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		return req, err
	}
	return req, nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{
		"error": err.Error(),
	})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
