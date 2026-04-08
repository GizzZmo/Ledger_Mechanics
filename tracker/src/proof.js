"use strict";

/**
 * proof.js — Proof generation for Lumina Ledger entries.
 *
 * Produces a keccak256 proofHash and a Merkle root (single-leaf by default)
 * from kWh / capital / behaviour data without requiring a live blockchain.
 */

const { ethers } = require("ethers");

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a proof payload for a single impact entry.
 *
 * @param {object} params
 * @param {number} params.category   - 0=energy, 1=capital, 2=behavior
 * @param {number} params.quantity   - Measured value (kWh, USD cents, units)
 * @param {number} [params.timestamp]- Unix ms timestamp (defaults to now)
 * @param {string} [params.extra]    - Optional free-form evidence string
 * @returns {Promise<{proofHash: string, merkleRoot: string, salt: string, leaf: string}>}
 */
async function generateProof({ category, quantity, timestamp, extra = "" }) {
  _validateCategory(category);
  _validateQuantity(quantity);

  const ts   = timestamp ?? Date.now();
  const salt = _randomSalt();

  // Canonical evidence blob (ABI-encoded for determinism)
  const leaf = _computeLeaf(category, quantity, ts, extra, salt);

  // For a single entry the "Merkle root" is the leaf itself.
  // For batch submissions callers should build a proper Merkle tree and
  // pass the root; this helper returns the single-leaf root.
  const proofHash  = leaf;           // keccak256 of evidence
  const merkleRoot = leaf;           // single-leaf Merkle root

  return { proofHash, merkleRoot, salt, leaf };
}

/**
 * Generate a Merkle root from multiple entries (batch proof).
 *
 * @param {Array<{category, quantity, timestamp, extra}>} entries
 * @returns {Promise<{merkleRoot: string, leaves: string[], salt: string}>}
 */
async function generateBatchProof(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("generateBatchProof: entries must be a non-empty array");
  }

  const salt   = _randomSalt();
  const ts     = Date.now();
  const leaves = entries.map((e) =>
    _computeLeaf(e.category, e.quantity, e.timestamp ?? ts, e.extra ?? "", salt)
  );

  const merkleRoot = _buildMerkleRoot(leaves);
  return { merkleRoot, leaves, salt };
}

/**
 * Verify that a leaf belongs to a Merkle tree.
 *
 * @param {string}   leaf       - 0x-prefixed hex leaf hash
 * @param {string[]} proof      - Sibling hashes from root to leaf
 * @param {string}   merkleRoot - Expected root
 * @returns {boolean}
 */
function verifyMerkleProof(leaf, proof, merkleRoot) {
  let current = leaf;
  for (const sibling of proof) {
    current = _hashPair(current, sibling);
  }
  return current.toLowerCase() === merkleRoot.toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function _computeLeaf(category, quantity, timestamp, extra, salt) {
  // ABI-encode then keccak256 — matches Solidity's abi.encodePacked semantics
  const encoded = ethers.solidityPacked(
    ["uint8", "uint256", "uint256", "string", "bytes32"],
    [category, quantity, timestamp, extra, salt]
  );
  return ethers.keccak256(encoded);
}

function _buildMerkleRoot(leaves) {
  if (leaves.length === 1) return leaves[0];

  let layer = [...leaves];
  // Pad to even length
  if (layer.length % 2 !== 0) layer.push(layer[layer.length - 1]);

  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(_hashPair(layer[i], layer[i + 1]));
    }
    if (next.length % 2 !== 0 && next.length > 1) next.push(next[next.length - 1]);
    layer = next;
  }

  return layer[0];
}

function _hashPair(a, b) {
  // Sort to make the tree canonical (same root regardless of leaf order)
  const [lo, hi] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([lo, hi]));
}

function _randomSalt() {
  // 32 random bytes as 0x-prefixed hex
  const arr = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return ethers.hexlify(arr);
}

function _validateCategory(category) {
  if (![0, 1, 2].includes(Number(category))) {
    throw new Error(`Invalid category "${category}". Must be 0 (energy), 1 (capital), or 2 (behavior).`);
  }
}

function _validateQuantity(quantity) {
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Invalid quantity "${quantity}". Must be a positive finite number.`);
  }
}

module.exports = { generateProof, generateBatchProof, verifyMerkleProof };
