// verify.go — Off-chain impact score verification for LuminaEntry
package main

import "fmt"

// ─────────────────────────────────────────────────────────────────────────────
// Constants — must mirror LuminaVerifier.sol
// ─────────────────────────────────────────────────────────────────────────────

const (
	scale                 = uint64(1_000_000) // 1e6 fixed-point scale
	defaultBaseline       = uint64(100) * scale
	defaultVerifierCount  = uint64(1)

	multiplierEnergy   = uint64(2)
	multiplierCapital  = uint64(1)
	multiplierBehavior = uint64(3)

	capitalCoeffNum = uint64(1)
	capitalCoeffDen = uint64(2) // capital coefficient = 0.5 = 1/2
)

// ─────────────────────────────────────────────────────────────────────────────
// VerificationResult
// ─────────────────────────────────────────────────────────────────────────────

// VerificationResult describes the outcome of an off-chain entry check.
type VerificationResult struct {
	EntryID       uint64 `json:"entryId"`
	Valid         bool   `json:"valid"`
	ExpectedScore uint64 `json:"expectedScore"`
	ActualScore   uint64 `json:"actualScore"`
	ScoreMatch    bool   `json:"scoreMatch"`
	Reason        string `json:"reason,omitempty"`
	Category      string `json:"category"`
}

// ─────────────────────────────────────────────────────────────────────────────
// VerifyEntry
// ─────────────────────────────────────────────────────────────────────────────

// VerifyEntry performs off-chain verification of a synced LuminaEntry.
//
// Rules checked:
//  1. Category must be 0, 1, or 2.
//  2. Quantity must be > 0.
//  3. ProofHash must be a non-zero 32-byte hex string.
//  4. Recomputed impact score must match the on-chain recorded score.
func VerifyEntry(e LuminaEntry) VerificationResult {
	res := VerificationResult{
		EntryID:  e.ID,
		Category: e.CategoryName(),
	}

	// Rule 1: valid category
	if e.Category > 2 {
		res.Valid  = false
		res.Reason = fmt.Sprintf("invalid category %d (must be 0, 1, or 2)", e.Category)
		return res
	}

	// Rule 2: positive quantity
	if e.Quantity == 0 {
		res.Valid  = false
		res.Reason = "quantity is zero"
		return res
	}

	// Rule 3: non-zero proof hash
	if !isValidProofHash(e.ProofHash) {
		res.Valid  = false
		res.Reason = fmt.Sprintf("invalid proof hash %q", e.ProofHash)
		return res
	}

	// Rule 4: score recomputation
	expected := ComputeImpactScore(e.Category, e.Quantity, defaultVerifierCount)
	res.ExpectedScore = expected
	res.ActualScore   = e.ImpactScore
	res.ScoreMatch    = expected == e.ImpactScore

	if !res.ScoreMatch {
		res.Valid  = false
		res.Reason = fmt.Sprintf(
			"impact score mismatch: expected %d, got %d",
			expected, e.ImpactScore,
		)
		return res
	}

	res.Valid = true
	return res
}

// ─────────────────────────────────────────────────────────────────────────────
// ComputeImpactScore — mirrors LuminaVerifier.sol logic
// ─────────────────────────────────────────────────────────────────────────────

// ComputeImpactScore replicates the Solidity formula:
//
//	score = (delta × multiplier × verifierCount) / baseline
//
// where:
//   - delta = quantity × scale        (or quantity × scale / 2 for capital)
//   - baseline = 100 × scale
func ComputeImpactScore(category uint8, quantity, verifierCount uint64) uint64 {
	delta := quantity * scale

	var multiplier uint64
	switch category {
	case 0: // energy
		multiplier = multiplierEnergy
	case 1: // capital — apply 0.5 coefficient
		delta      = delta * capitalCoeffNum / capitalCoeffDen
		multiplier = multiplierCapital
	case 2: // behavior
		multiplier = multiplierBehavior
	default:
		return 0
	}

	return (delta * multiplier * verifierCount) / defaultBaseline
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// isValidProofHash returns true if h looks like a non-zero 32-byte hex string.
func isValidProofHash(h string) bool {
	if len(h) == 0 {
		return false
	}
	// Strip optional "0x" prefix
	stripped := h
	if len(h) > 1 && h[0] == '0' && (h[1] == 'x' || h[1] == 'X') {
		stripped = h[2:]
	}
	if len(stripped) != 64 {
		return false
	}
	allZero := true
	for _, c := range stripped {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
		if c != '0' {
			allZero = false
		}
	}
	return !allZero
}
