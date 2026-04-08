// sync.go — Block sync and EntrySubmitted event parsing
package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

// LuminaEntry mirrors the on-chain struct.
type LuminaEntry struct {
	ID          uint64 `json:"id"`
	BlockNumber uint64 `json:"blockNumber"`
	TxHash      string `json:"txHash"`

	Timestamp   uint64 `json:"timestamp"`
	User        string `json:"user"`
	Category    uint8  `json:"category"` // 0=energy,1=capital,2=behavior
	Quantity    uint64 `json:"quantity"`
	ProofHash   string `json:"proofHash"`
	ImpactScore uint64 `json:"impactScore"`
	MerkleRoot  string `json:"merkleRoot"`
}

// CategoryName returns a human-readable category label.
func (e LuminaEntry) CategoryName() string {
	switch e.Category {
	case 0:
		return "energy"
	case 1:
		return "capital"
	case 2:
		return "behavior"
	default:
		return "unknown"
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// EntryStore — thread-safe in-memory store
// ─────────────────────────────────────────────────────────────────────────────

type EntryStore struct {
	mu      chan struct{} // acts as a mutex token
	entries []LuminaEntry
	byID    map[uint64]int // entryId → slice index
}

func NewEntryStore() *EntryStore {
	s := &EntryStore{
		mu:   make(chan struct{}, 1),
		byID: make(map[uint64]int),
	}
	s.mu <- struct{}{} // initially unlocked
	return s
}

func (s *EntryStore) lock()   { <-s.mu }
func (s *EntryStore) unlock() { s.mu <- struct{}{} }

func (s *EntryStore) Add(e LuminaEntry) {
	s.lock()
	defer s.unlock()
	if _, exists := s.byID[e.ID]; !exists {
		s.byID[e.ID] = len(s.entries)
		s.entries = append(s.entries, e)
	}
}

func (s *EntryStore) GetByID(id uint64) (LuminaEntry, bool) {
	s.lock()
	defer s.unlock()
	idx, ok := s.byID[id]
	if !ok {
		return LuminaEntry{}, false
	}
	return s.entries[idx], true
}

func (s *EntryStore) Count() int {
	s.lock()
	defer s.unlock()
	return len(s.entries)
}

func (s *EntryStore) Paginate(page, limit int) []LuminaEntry {
	s.lock()
	defer s.unlock()
	start := page * limit
	if start >= len(s.entries) {
		return []LuminaEntry{}
	}
	end := start + limit
	if end > len(s.entries) {
		end = len(s.entries)
	}
	result := make([]LuminaEntry, end-start)
	copy(result, s.entries[start:end])
	return result
}

// Leaderboard returns the top-N users by cumulative impact score.
func (s *EntryStore) Leaderboard(n int) []LeaderboardEntry {
	s.lock()
	scores := make(map[string]*LeaderboardEntry)
	for _, e := range s.entries {
		user := strings.ToLower(e.User)
		le, ok := scores[user]
		if !ok {
			le = &LeaderboardEntry{User: e.User}
			scores[user] = le
		}
		le.TotalScore += e.ImpactScore
		le.EntryCount++
	}
	s.unlock()

	board := make([]LeaderboardEntry, 0, len(scores))
	for _, le := range scores {
		board = append(board, *le)
	}
	// Simple insertion sort (leaderboard is typically small)
	for i := 1; i < len(board); i++ {
		for j := i; j > 0 && board[j].TotalScore > board[j-1].TotalScore; j-- {
			board[j], board[j-1] = board[j-1], board[j]
		}
	}
	if n > len(board) {
		n = len(board)
	}
	return board[:n]
}

// LeaderboardEntry represents one row in the leaderboard.
type LeaderboardEntry struct {
	User       string `json:"user"`
	TotalScore uint64 `json:"totalScore"`
	EntryCount int    `json:"entryCount"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Syncer
// ─────────────────────────────────────────────────────────────────────────────

// EntrySubmitted(uint256 indexed entryId, address indexed user, uint8 category,
//                uint256 quantity, uint256 impactScore, bytes32 proofHash)
//
// keccak256("EntrySubmitted(uint256,address,uint8,uint256,uint256,bytes32)")
// Verified with: ethers.id("EntrySubmitted(uint256,address,uint8,uint256,uint256,bytes32)")
const entrySubmittedTopic = "0x986b0b62f9953813275a54cf4260648401e5095c98bc868dd7fca7a2f77369ae"

// Syncer polls an Ethereum JSON-RPC endpoint for new blocks and
// extracts EntrySubmitted events.
type Syncer struct {
	cfg       Config
	store     *EntryStore
	lastBlock atomic.Uint64
	client    *http.Client
}

func NewSyncer(cfg Config, store *EntryStore) *Syncer {
	s := &Syncer{
		cfg:   cfg,
		store: store,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
	s.lastBlock.Store(cfg.StartBlock)
	return s
}

func (s *Syncer) LastBlock() uint64 {
	return s.lastBlock.Load()
}

// Run polls for new blocks in a loop until ctx is cancelled.
func (s *Syncer) Run(ctx context.Context) error {
	ticker := time.NewTicker(s.cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := s.syncOnce(ctx); err != nil {
				log.Printf("[sync] error during sync: %v", err)
			}
		}
	}
}

func (s *Syncer) syncOnce(ctx context.Context) error {
	if s.cfg.ContractAddress == "" {
		// No contract configured – nothing to sync
		return nil
	}

	latest, err := s.getLatestBlock(ctx)
	if err != nil {
		return fmt.Errorf("getLatestBlock: %w", err)
	}

	from := s.lastBlock.Load()
	if from > latest {
		return nil
	}

	// Cap batch size to avoid oversized responses
	to := latest
	if to-from > 500 {
		to = from + 500
	}

	logs, err := s.getLogs(ctx, from, to)
	if err != nil {
		return fmt.Errorf("getLogs(%d-%d): %w", from, to, err)
	}

	for _, l := range logs {
		entry, err := parseEntryLog(l)
		if err != nil {
			log.Printf("[sync] skip malformed log: %v", err)
			continue
		}
		s.store.Add(entry)
	}

	s.lastBlock.Store(to + 1)
	if len(logs) > 0 {
		log.Printf("[sync] blocks %d-%d → %d entries found", from, to, len(logs))
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON-RPC helpers
// ─────────────────────────────────────────────────────────────────────────────

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
	ID      int    `json:"id"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

type ethLog struct {
	Address     string   `json:"address"`
	Topics      []string `json:"topics"`
	Data        string   `json:"data"`
	BlockNumber string   `json:"blockNumber"`
	TxHash      string   `json:"transactionHash"`
	LogIndex    string   `json:"logIndex"`
}

func (s *Syncer) rpcCall(ctx context.Context, method string, params []any) (json.RawMessage, error) {
	body, _ := json.Marshal(rpcRequest{JSONRPC: "2.0", Method: method, Params: params, ID: 1})
	req, err := http.NewRequestWithContext(ctx, "POST", s.cfg.RPCURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var rpcResp rpcResponse
	if err := json.Unmarshal(raw, &rpcResp); err != nil {
		return nil, fmt.Errorf("unmarshal rpc response: %w", err)
	}
	if rpcResp.Error != nil {
		return nil, fmt.Errorf("rpc error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}
	return rpcResp.Result, nil
}

func (s *Syncer) getLatestBlock(ctx context.Context) (uint64, error) {
	result, err := s.rpcCall(ctx, "eth_blockNumber", []any{})
	if err != nil {
		return 0, err
	}
	var hexStr string
	if err := json.Unmarshal(result, &hexStr); err != nil {
		return 0, err
	}
	n := new(big.Int)
	n.SetString(strings.TrimPrefix(hexStr, "0x"), 16)
	return n.Uint64(), nil
}

func (s *Syncer) getLogs(ctx context.Context, from, to uint64) ([]ethLog, error) {
	filter := map[string]any{
		"address":   strings.ToLower(s.cfg.ContractAddress),
		"fromBlock": fmt.Sprintf("0x%x", from),
		"toBlock":   fmt.Sprintf("0x%x", to),
		"topics":    []string{entrySubmittedTopic},
	}
	result, err := s.rpcCall(ctx, "eth_getLogs", []any{filter})
	if err != nil {
		return nil, err
	}
	var logs []ethLog
	if err := json.Unmarshal(result, &logs); err != nil {
		return nil, err
	}
	return logs, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Log parsing
// ─────────────────────────────────────────────────────────────────────────────

// parseEntryLog decodes an eth_getLogs log into a LuminaEntry.
//
// Event signature:
//   EntrySubmitted(uint256 indexed entryId, address indexed user,
//                  uint8 category, uint256 quantity, uint256 impactScore, bytes32 proofHash)
//
// topics[0] = event sig hash
// topics[1] = entryId (indexed, uint256)
// topics[2] = user    (indexed, address)
// data      = abi.encode(category, quantity, impactScore, proofHash)
func parseEntryLog(l ethLog) (LuminaEntry, error) {
	if len(l.Topics) < 3 {
		return LuminaEntry{}, fmt.Errorf("expected ≥3 topics, got %d", len(l.Topics))
	}

	entryID := hexToBigInt(l.Topics[1]).Uint64()
	user    := "0x" + l.Topics[2][26:] // last 20 bytes of 32-byte topic

	// data = abi.encode(uint8 category, uint256 quantity, uint256 impactScore, bytes32 proofHash)
	// = 4 × 32-byte words
	data := strings.TrimPrefix(l.Data, "0x")
	if len(data) < 256 {
		return LuminaEntry{}, fmt.Errorf("data too short: %d hex chars", len(data))
	}

	categoryBig  := hexToBigInt(data[0:64])
	quantityBig  := hexToBigInt(data[64:128])
	scoreBig     := hexToBigInt(data[128:192])
	proofHashHex := data[192:256]

	blockNum := hexToBigInt(strings.TrimPrefix(l.BlockNumber, "0x")).Uint64()

	return LuminaEntry{
		ID:          entryID,
		BlockNumber: blockNum,
		TxHash:      l.TxHash,
		User:        user,
		Category:    uint8(categoryBig.Uint64()),
		Quantity:    quantityBig.Uint64(),
		ImpactScore: scoreBig.Uint64(),
		ProofHash:   "0x" + proofHashHex,
	}, nil
}

func hexToBigInt(h string) *big.Int {
	h = strings.TrimPrefix(h, "0x")
	b, err := hex.DecodeString(h)
	if err != nil {
		return new(big.Int)
	}
	return new(big.Int).SetBytes(b)
}
