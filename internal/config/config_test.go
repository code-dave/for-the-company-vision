package config

import "testing"

func TestNormalizeBaseURL(t *testing.T) {
	tests := map[string]string{
		"jira.example.com/Somepath":           "https://jira.example.com",
		"https://jira.example.com/some/path/": "https://jira.example.com",
		"http://jira.example.com":             "http://jira.example.com",
		"  jira.example.com  ":                "https://jira.example.com",
	}

	for input, expected := range tests {
		if actual := normalizeBaseURL(input); actual != expected {
			t.Fatalf("normalizeBaseURL(%q) = %q, expected %q", input, actual, expected)
		}
	}
}
