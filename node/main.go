// main.go — Lumina Light Client Node
//
// Starts an HTTP server that exposes a REST API for querying synced ledger
// entries and impact verification results. A background goroutine polls the
// configured RPC endpoint for new blocks and parses EntrySubmitted events.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

// Config holds runtime configuration sourced from environment variables.
type Config struct {
	ListenAddr      string
	RPCURL          string
	ContractAddress string
	PollInterval    time.Duration
	StartBlock      uint64
}

func loadConfig() Config {
	cfg := Config{
		ListenAddr:      envOr("LISTEN_ADDR", ":8080"),
		RPCURL:          envOr("RPC_URL", "http://127.0.0.1:8545"),
		ContractAddress: envOr("LEDGER_ADDRESS", ""),
		PollInterval:    parseDuration(envOr("POLL_INTERVAL", "12s")),
		StartBlock:      parseUint64(envOr("START_BLOCK", "0")),
	}
	return cfg
}

func main() {
	cfg    := loadConfig()
	store  := NewEntryStore()
	syncer := NewSyncer(cfg, store)

	// ── Background sync loop ──────────────────────────────────────────────────

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		log.Printf("[sync] Starting block syncer from block %d (poll=%s)", cfg.StartBlock, cfg.PollInterval)
		if err := syncer.Run(ctx); err != nil && err != context.Canceled {
			log.Printf("[sync] Syncer exited with error: %v", err)
		}
	}()

	// ── HTTP handlers ─────────────────────────────────────────────────────────

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		jsonOK(w, map[string]string{"status": "ok", "time": time.Now().UTC().Format(time.RFC3339)})
	})

	mux.HandleFunc("GET /entries", func(w http.ResponseWriter, r *http.Request) {
		q     := r.URL.Query()
		limit := parseIntQuery(q.Get("limit"), 50)
		page  := parseIntQuery(q.Get("page"), 0)

		entries := store.Paginate(page, limit)
		jsonOK(w, map[string]any{
			"count":   len(entries),
			"page":    page,
			"limit":   limit,
			"entries": entries,
		})
	})

	mux.HandleFunc("GET /entries/{id}", func(w http.ResponseWriter, r *http.Request) {
		idStr := r.PathValue("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			jsonError(w, "invalid id", http.StatusBadRequest)
			return
		}
		entry, ok := store.GetByID(id)
		if !ok {
			jsonError(w, "entry not found", http.StatusNotFound)
			return
		}
		jsonOK(w, entry)
	})

	mux.HandleFunc("GET /leaderboard", func(w http.ResponseWriter, r *http.Request) {
		topN := parseIntQuery(r.URL.Query().Get("top"), 10)
		jsonOK(w, map[string]any{
			"leaderboard": store.Leaderboard(topN),
		})
	})

	mux.HandleFunc("GET /verify/{id}", func(w http.ResponseWriter, r *http.Request) {
		idStr := r.PathValue("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			jsonError(w, "invalid id", http.StatusBadRequest)
			return
		}
		entry, ok := store.GetByID(id)
		if !ok {
			jsonError(w, "entry not found", http.StatusNotFound)
			return
		}
		result := VerifyEntry(entry)
		jsonOK(w, result)
	})

	mux.HandleFunc("GET /sync/status", func(w http.ResponseWriter, r *http.Request) {
		jsonOK(w, map[string]any{
			"lastBlock":    syncer.LastBlock(),
			"entrySynced":  store.Count(),
			"contractAddr": cfg.ContractAddress,
			"rpcURL":       cfg.RPCURL,
		})
	})

	// ── Server ────────────────────────────────────────────────────────────────

	srv := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      logMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("[http] Listening on %s", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[http] Fatal: %v", err)
		}
	}()

	<-quit
	log.Println("[main] Shutting down…")
	cancel()

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutCancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		log.Printf("[http] Shutdown error: %v", err)
	}
	log.Println("[main] Stopped.")
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[http] encode error: %v", err)
	}
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func logMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("[http] %s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 12 * time.Second
	}
	return d
}

func parseUint64(s string) uint64 {
	n, _ := strconv.ParseUint(s, 10, 64)
	return n
}

func parseIntQuery(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return def
	}
	return n
}

// Ensure fmt is used (used in sync.go / verify.go via Sprintf)
var _ = fmt.Sprintf
