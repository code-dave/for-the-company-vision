package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/code-dave/for-the-company-vision/internal/analysis"
	"github.com/code-dave/for-the-company-vision/internal/jira"
)

type Cache struct {
	dir string
}

func New(dir string) *Cache {
	return &Cache{dir: dir}
}

func (c *Cache) SaveSnapshot(snapshot *jira.Snapshot) error {
	if snapshot == nil {
		return fmt.Errorf("snapshot is nil")
	}
	return c.writeJSON(c.snapshotPath(snapshot.Project), snapshot)
}

func (c *Cache) LoadSnapshot(project string) (*jira.Snapshot, error) {
	var snapshot jira.Snapshot
	if err := c.readJSON(c.snapshotPath(project), &snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (c *Cache) SaveAnalysis(result *analysis.BoardAnalysis) error {
	if result == nil {
		return fmt.Errorf("analysis is nil")
	}
	return c.writeJSON(c.analysisPath(result.Project), result)
}

func (c *Cache) LoadAnalysis(project string) (*analysis.BoardAnalysis, error) {
	var result analysis.BoardAnalysis
	if err := c.readJSON(c.analysisPath(project), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Cache) snapshotPath(project string) string {
	return filepath.Join(c.dir, "snapshot-"+safeName(project)+".json")
}

func (c *Cache) analysisPath(project string) string {
	return filepath.Join(c.dir, "analysis-"+safeName(project)+".json")
}

func (c *Cache) writeJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func (c *Cache) readJSON(path string, value any) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return json.NewDecoder(file).Decode(value)
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9_.-]+`)

func safeName(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if value == "" {
		value = "PROJECT"
	}
	return unsafeName.ReplaceAllString(value, "-")
}
