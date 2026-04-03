// Package main implements a lightweight Go health monitor that polls all
// internal Docker services and exposes an aggregated status API.
// It runs inside the Docker network — all service URLs are internal only.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// ─── Types ───

type ServiceCheck struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency_ms"`
	Error     string `json:"error,omitempty"`
	LastCheck string `json:"last_check"`
}

type DashboardStatus struct {
	Overall  string         `json:"overall"`
	Services []ServiceCheck `json:"services"`
	Uptime   int64          `json:"uptime_seconds"`
}

// ─── Config ───

type serviceConfig struct {
	name string
	url  string
}

var (
	mu      sync.RWMutex
	current DashboardStatus
	startAt = time.Now()
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getServices() []serviceConfig {
	return []serviceConfig{
		{"backend", envOr("BACKEND_URL", "http://backend:3001") + "/health"},
		{"searxng", envOr("SEARXNG_URL", "http://searxng:8080")},
		{"browserless", envOr("BROWSERLESS_URL", "http://browserless:3000") + "/pressure"},
		{"qdrant", envOr("QDRANT_URL", "http://qdrant:6333") + "/healthz"},
		{"embedding", envOr("EMBEDDING_URL", "http://embedding:8000") + "/health"},
		{"n8n", envOr("N8N_URL", "http://n8n:5678") + "/healthz"},
	}
}

// ─── Health Checker ───

func checkService(svc serviceConfig) ServiceCheck {
	start := time.Now()
	check := ServiceCheck{
		Name:      svc.name,
		URL:       svc.url,
		LastCheck: time.Now().UTC().Format(time.RFC3339),
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(svc.url)
	check.LatencyMs = time.Since(start).Milliseconds()

	if err != nil {
		check.Status = "error"
		check.Error = err.Error()
		return check
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		check.Status = "ok"
	} else {
		check.Status = "degraded"
		check.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return check
}

func runChecks() {
	services := getServices()
	checks := make([]ServiceCheck, len(services))

	var wg sync.WaitGroup
	for i, svc := range services {
		wg.Add(1)
		go func(idx int, s serviceConfig) {
			defer wg.Done()
			checks[idx] = checkService(s)
		}(i, svc)
	}
	wg.Wait()

	overall := "healthy"
	criticalDown := false
	for _, c := range checks {
		if c.Status == "error" {
			// backend, qdrant, embedding are critical
			if c.Name == "backend" || c.Name == "qdrant" || c.Name == "embedding" {
				criticalDown = true
			}
		}
	}
	if criticalDown {
		overall = "degraded"
	}

	mu.Lock()
	current = DashboardStatus{
		Overall:  overall,
		Services: checks,
		Uptime:   int64(time.Since(startAt).Seconds()),
	}
	mu.Unlock()
}

func pollLoop(interval time.Duration) {
	runChecks() // initial check
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		runChecks()
	}
}

// ─── HTTP API ───

func handleStatus(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	data := current
	mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	if data.Overall != "healthy" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(data)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	overall := current.Overall
	mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	if overall != "healthy" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(map[string]string{"status": overall})
}

func handleServiceDetail(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	mu.RLock()
	defer mu.RUnlock()

	for _, svc := range current.Services {
		if svc.Name == name {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(svc)
			return
		}
	}
	http.NotFound(w, r)
}

func main() {
	port := envOr("PORT", "8001")
	interval, _ := time.ParseDuration(envOr("CHECK_INTERVAL", "30s"))
	if interval < 5*time.Second {
		interval = 30 * time.Second
	}

	log.Printf("Monitor starting — port=%s interval=%s", port, interval)
	log.Printf("Monitoring %d services on internal Docker network", len(getServices()))

	go pollLoop(interval)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /", handleStatus)
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /service/{name}", handleServiceDetail)

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	log.Printf("Monitor listening on :%s", port)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
