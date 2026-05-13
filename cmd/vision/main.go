package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/code-dave/for-the-company-vision/internal/analysis"
	"github.com/code-dave/for-the-company-vision/internal/config"
	"github.com/code-dave/for-the-company-vision/internal/httpapi"
	"github.com/code-dave/for-the-company-vision/internal/jira"
	"github.com/code-dave/for-the-company-vision/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("vision command failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	command := "serve"
	if len(os.Args) > 1 && !strings.HasPrefix(os.Args[1], "-") {
		command = os.Args[1]
	}

	switch command {
	case "serve":
		return runServe(os.Args[2:])
	case "sync":
		return runSync(os.Args[2:])
	case "analyze":
		return runAnalyze(os.Args[2:])
	case "health":
		return runHealth(os.Args[2:])
	default:
		return fmt.Errorf("unknown command %q; expected serve, sync, analyze, or health", command)
	}
}

func runServe(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", "", "listen address, defaults to :$VISION_PORT")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(".")
	if err != nil {
		return err
	}
	if *addr == "" {
		*addr = fmt.Sprintf(":%d", cfg.Port)
	}

	server, err := buildServer(cfg)
	if err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:              *addr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("company vision service listening", "addr", *addr)
		errCh <- httpServer.ListenAndServe()
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case <-stop:
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpServer.Shutdown(ctx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func runSync(args []string) error {
	fs := flag.NewFlagSet("sync", flag.ExitOnError)
	project := fs.String("project", "", "Jira project key")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(".")
	if err != nil {
		return err
	}
	if *project == "" {
		*project = cfg.JiraProject
	}
	if *project == "" {
		return errors.New("project is required; set JIRA_PROJECT or pass -project")
	}

	jiraClient, err := jira.NewClient(cfg.JiraBaseURL, cfg.JiraToken)
	if err != nil {
		return err
	}
	cache := store.New(cfg.CacheDir)

	ctx, cancel := context.WithTimeout(context.Background(), cfg.JiraTimeout)
	defer cancel()

	snapshot, err := jiraClient.FetchProject(ctx, *project)
	if err != nil {
		return err
	}
	if err := cache.SaveSnapshot(snapshot); err != nil {
		return err
	}

	return json.NewEncoder(os.Stdout).Encode(snapshot)
}

func runAnalyze(args []string) error {
	fs := flag.NewFlagSet("analyze", flag.ExitOnError)
	project := fs.String("project", "", "Jira project key")
	syncFirst := fs.Bool("sync", false, "sync Jira before analysis")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(".")
	if err != nil {
		return err
	}
	if *project == "" {
		*project = cfg.JiraProject
	}
	if *project == "" {
		return errors.New("project is required; set JIRA_PROJECT or pass -project")
	}

	cache := store.New(cfg.CacheDir)
	var snapshot *jira.Snapshot
	if *syncFirst {
		jiraClient, err := jira.NewClient(cfg.JiraBaseURL, cfg.JiraToken)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), cfg.JiraTimeout)
		defer cancel()
		snapshot, err = jiraClient.FetchProject(ctx, *project)
		if err != nil {
			return err
		}
		if err := cache.SaveSnapshot(snapshot); err != nil {
			return err
		}
	} else {
		snapshot, err = cache.LoadSnapshot(*project)
		if err != nil {
			return err
		}
	}

	analyzer := analysis.NewCodexAnalyzer(cfg.Codex)
	ctx, cancel := context.WithTimeout(context.Background(), cfg.Codex.Timeout)
	defer cancel()

	result, err := analyzer.Analyze(ctx, snapshot)
	if err != nil {
		return err
	}
	if err := cache.SaveAnalysis(result); err != nil {
		return err
	}

	return json.NewEncoder(os.Stdout).Encode(result)
}

func runHealth(args []string) error {
	fs := flag.NewFlagSet("health", flag.ExitOnError)
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(".")
	if err != nil {
		return err
	}
	server, err := buildServer(cfg)
	if err != nil {
		return err
	}

	return json.NewEncoder(os.Stdout).Encode(server.Health())
}

func buildServer(cfg config.Config) (*httpapi.Server, error) {
	var jiraClient *jira.Client
	if cfg.JiraBaseURL != "" && cfg.JiraToken != "" {
		var err error
		jiraClient, err = jira.NewClient(cfg.JiraBaseURL, cfg.JiraToken)
		if err != nil {
			return nil, err
		}
	}
	analyzer := analysis.NewCodexAnalyzer(cfg.Codex)
	cache := store.New(cfg.CacheDir)
	return httpapi.NewServer(cfg, jiraClient, analyzer, cache), nil
}
