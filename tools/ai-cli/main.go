// Package main implements the AI Dashboard CLI tool.
// All commands talk to the backend API over HTTP.
// Zero external dependencies — Go standard library only.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"text/tabwriter"
	"time"
)

var (
	baseURL = envOr("AI_DASHBOARD_URL", "http://localhost:3001")
	apiKey  = os.Getenv("AI_DASHBOARD_API_KEY")
	client  = &http.Client{Timeout: 30 * time.Second}
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── HTTP helpers ───

func apiGet(path string) (map[string]any, error) {
	req, err := http.NewRequest("GET", baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}
	return doRequest(req)
}

func apiPost(path string, body any) (map[string]any, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("POST", baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}
	return doRequest(req)
}

func doRequest(req *http.Request) (map[string]any, error) {
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read error: %w", err)
	}

	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("invalid JSON response: %s", string(body[:min(len(body), 200)]))
	}

	if resp.StatusCode >= 400 {
		errMsg, _ := result["error"].(string)
		if errMsg == "" {
			errMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return result, fmt.Errorf("%s", errMsg)
	}

	return result, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ─── Commands ───

func cmdHealth() {
	res, err := apiGet("/health")
	if err != nil {
		fatalf("Health check failed: %v", err)
	}

	data, _ := res["data"].(map[string]any)
	if data == nil {
		fatalf("Unexpected response format")
	}

	status, _ := data["status"].(string)
	uptime, _ := data["uptime"].(float64)
	checks, _ := data["checks"].(map[string]any)

	fmt.Printf("Status:  %s\n", colorStatus(status))
	fmt.Printf("Uptime:  %.0fs\n", uptime)

	if checks != nil {
		fmt.Println("\nServices:")
		tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		for name, val := range checks {
			s, _ := val.(string)
			fmt.Fprintf(tw, "  %s\t%s\n", name, colorStatus(s))
		}
		tw.Flush()
	}
}

func cmdSearch(query string) {
	fmt.Printf("Searching: %s\n\n", query)
	res, err := apiPost("/search", map[string]any{"query": query})
	if err != nil {
		fatalf("Search failed: %v", err)
	}

	data, _ := res["data"].(map[string]any)
	if data == nil {
		fmt.Println("No results")
		return
	}

	results, _ := data["results"].([]any)
	if len(results) == 0 {
		fmt.Println("No results found")
		return
	}

	for i, r := range results {
		item, _ := r.(map[string]any)
		if item == nil {
			continue
		}
		title, _ := item["title"].(string)
		u, _ := item["url"].(string)
		snippet, _ := item["snippet"].(string)
		fmt.Printf("%d. %s\n   %s\n   %s\n\n", i+1, title, u, truncate(snippet, 120))
	}
}

func cmdBrowse(rawURL string) {
	fmt.Printf("Browsing: %s\n\n", rawURL)
	res, err := apiPost("/browse", map[string]any{"url": rawURL})
	if err != nil {
		fatalf("Browse failed: %v", err)
	}

	data, _ := res["data"].(map[string]any)
	if data == nil {
		fmt.Println("No content returned")
		return
	}

	text, _ := data["text"].(string)
	length, _ := data["contentLength"].(float64)
	fmt.Printf("Content length: %.0f chars\n\n", length)
	fmt.Println(truncate(text, 5000))
}

func cmdAgentRun(agentType, input string) {
	validTypes := map[string]bool{
		"research": true, "monitor": true,
		"automation": true, "memory": true,
	}
	if !validTypes[agentType] {
		fatalf("Invalid agent type: %s (must be research|monitor|automation|memory)", agentType)
	}

	fmt.Printf("Starting %s agent: %s\n", agentType, input)
	res, err := apiPost("/agent/run", map[string]any{
		"type":  agentType,
		"input": input,
	})
	if err != nil {
		fatalf("Agent run failed: %v", err)
	}

	data, _ := res["data"].(map[string]any)
	if data == nil {
		fatalf("Unexpected response")
	}

	taskID, _ := data["taskId"].(string)
	fmt.Printf("\nTask started: %s\n", taskID)
	fmt.Printf("Check status: ai-cli agent status %s\n", taskID)
}

func cmdAgentStatus(taskID string) {
	res, err := apiGet("/agent/status/" + url.PathEscape(taskID))
	if err != nil {
		fatalf("Status check failed: %v", err)
	}

	data, _ := res["data"].(map[string]any)
	if data == nil {
		fatalf("Task not found")
	}

	status, _ := data["status"].(string)
	agentType, _ := data["type"].(string)
	createdAt, _ := data["created_at"].(string)

	fmt.Printf("Task:    %s\n", taskID)
	fmt.Printf("Type:    %s\n", agentType)
	fmt.Printf("Status:  %s\n", colorStatus(status))
	fmt.Printf("Created: %s\n", createdAt)

	if result, ok := data["result"]; ok && result != nil {
		fmt.Println("\nResult:")
		pretty, _ := json.MarshalIndent(result, "  ", "  ")
		fmt.Printf("  %s\n", string(pretty))
	}

	if errStr, ok := data["error"].(string); ok && errStr != "" {
		fmt.Printf("\nError: %s\n", errStr)
	}
}

func cmdAgentList() {
	res, err := apiGet("/agent/tasks?limit=20")
	if err != nil {
		fatalf("Failed to list tasks: %v", err)
	}

	data, _ := res["data"].([]any)
	if len(data) == 0 {
		fmt.Println("No tasks found")
		return
	}

	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintf(tw, "ID\tTYPE\tSTATUS\tCREATED\n")
	fmt.Fprintf(tw, "──\t────\t──────\t───────\n")

	for _, item := range data {
		task, _ := item.(map[string]any)
		if task == nil {
			continue
		}
		id, _ := task["id"].(string)
		t, _ := task["type"].(string)
		s, _ := task["status"].(string)
		c, _ := task["created_at"].(string)
		// Truncate UUID for display
		shortID := id
		if len(id) > 8 {
			shortID = id[:8]
		}
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n", shortID, t, colorStatus(s), formatTime(c))
	}
	tw.Flush()
}

func cmdMemorySearch(query string) {
	q := url.QueryEscape(query)
	res, err := apiGet("/memory/search?q=" + q)
	if err != nil {
		fatalf("Memory search failed: %v", err)
	}

	data, _ := res["data"].([]any)
	if len(data) == 0 {
		fmt.Println("No memories found")
		return
	}

	for i, item := range data {
		entry, _ := item.(map[string]any)
		if entry == nil {
			continue
		}
		id, _ := entry["id"].(string)
		summary, _ := entry["summary"].(string)
		content, _ := entry["content"].(string)
		created, _ := entry["created_at"].(string)

		fmt.Printf("%d. [%s] %s\n", i+1, formatTime(created), id[:8])
		if summary != "" {
			fmt.Printf("   Summary: %s\n", truncate(summary, 100))
		}
		fmt.Printf("   %s\n\n", truncate(content, 200))
	}
}

// ─── Formatting helpers ───

func colorStatus(s string) string {
	switch s {
	case "ok", "healthy", "completed":
		return "\033[32m" + s + "\033[0m" // green
	case "error", "failed":
		return "\033[31m" + s + "\033[0m" // red
	case "degraded", "executing", "planning":
		return "\033[33m" + s + "\033[0m" // yellow
	default:
		return s
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func formatTime(iso string) string {
	t, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		return iso
	}
	return t.Local().Format("Jan 2 15:04")
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "Error: "+format+"\n", args...)
	os.Exit(1)
}

// ─── Main ───

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "health", "h":
		cmdHealth()

	case "search", "s":
		if len(args) < 1 {
			fatalf("Usage: ai-cli search <query>")
		}
		cmdSearch(strings.Join(args, " "))

	case "browse", "b":
		if len(args) < 1 {
			fatalf("Usage: ai-cli browse <url>")
		}
		cmdBrowse(args[0])

	case "agent", "a":
		if len(args) < 1 {
			fatalf("Usage: ai-cli agent <run|status|list>")
		}
		switch args[0] {
		case "run":
			if len(args) < 3 {
				fatalf("Usage: ai-cli agent run <type> <input...>")
			}
			cmdAgentRun(args[1], strings.Join(args[2:], " "))
		case "status":
			if len(args) < 2 {
				fatalf("Usage: ai-cli agent status <task-id>")
			}
			cmdAgentStatus(args[1])
		case "list":
			cmdAgentList()
		default:
			fatalf("Unknown agent subcommand: %s", args[0])
		}

	case "memory", "m":
		if len(args) < 2 || args[0] != "search" {
			fatalf("Usage: ai-cli memory search <query>")
		}
		cmdMemorySearch(strings.Join(args[1:], " "))

	case "help", "--help", "-h":
		printUsage()

	default:
		fatalf("Unknown command: %s\nRun 'ai-cli help' for usage.", cmd)
	}
}

func printUsage() {
	fmt.Print(`AI Dashboard CLI — interact with all platform services

Usage:
  ai-cli <command> [arguments]

Commands:
  health                          Check system health
  search <query>                  Search the web via SearXNG
  browse <url>                    Fetch and extract page content
  agent run <type> <input>        Run agent (research|monitor|automation|memory)
  agent status <id>               Check agent task status
  agent list                      List recent agent tasks
  memory search <query>           Search stored memories
  help                            Show this help

Environment:
  AI_DASHBOARD_URL                Backend URL (default: http://localhost:3001)
  AI_DASHBOARD_API_KEY            API key for authentication

Examples:
  ai-cli health
  ai-cli search "latest AI research papers"
  ai-cli agent run research "compare vector databases"
  ai-cli agent list
  ai-cli memory search "vector database"
  ai-cli browse https://example.com
`)
}
