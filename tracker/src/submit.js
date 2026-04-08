"use strict";

/**
 * submit.js — Submit a signed entry to LuminaLedger on-chain.
 *
 * Also exposes fetchLeaderboard() for the `leaderboard` CLI command.
 */

const { ethers } = require("ethers");

// Minimal ABI — only the functions the CLI needs
const LUMINA_LEDGER_ABI = [
  // submitEntry(uint8 category, uint256 quantity, bytes32 proofHash, bytes32 merkleRoot)
  "function submitEntry(uint8 category_, uint256 quantity_, bytes32 proofHash_, bytes32 merkleRoot_) external returns (uint256 entryId)",

  // View helpers
  "function entryCount() external view returns (uint256)",
  "function getEntry(uint256 entryId) external view returns (tuple(uint256 timestamp, address user, uint8 category, uint256 quantity, bytes32 proofHash, uint256 impactScore, bytes32 merkleRoot))",
  "function userScore(address user) external view returns (uint256)",

  // Events
  "event EntrySubmitted(uint256 indexed entryId, address indexed user, uint8 category, uint256 quantity, uint256 impactScore, bytes32 proofHash)",
];

// ─────────────────────────────────────────────────────────────────────────────
// submitEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a signer, connect to the ledger contract, and submit an entry.
 *
 * @param {object} opts
 * @param {string} opts.rpcUrl           - JSON-RPC provider URL
 * @param {string} opts.privateKey       - Signer private key (0x-prefixed)
 * @param {string} opts.contractAddress  - Deployed LuminaLedger address
 * @param {number} opts.category         - 0 | 1 | 2
 * @param {number} opts.quantity         - Positive integer
 * @param {string} opts.proofHash        - bytes32 hex string
 * @param {string} opts.merkleRoot       - bytes32 hex string
 * @returns {Promise<ethers.TransactionReceipt>}
 */
async function submitEntry({ rpcUrl, privateKey, contractAddress, category, quantity, proofHash, merkleRoot }) {
  _assertNonEmpty(rpcUrl,          "rpcUrl");
  _assertNonEmpty(privateKey,      "privateKey");
  _assertNonEmpty(contractAddress, "contractAddress");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer   = new ethers.Wallet(privateKey, provider);
  const ledger   = new ethers.Contract(contractAddress, LUMINA_LEDGER_ABI, signer);

  console.log(`  Signer: ${signer.address}`);

  const tx = await ledger.submitEntry(
    category,
    quantity,
    proofHash,
    merkleRoot,
    { gasLimit: 500_000n }
  );

  console.log(`  Pending tx: ${tx.hash}`);
  const receipt = await tx.wait(1);
  return receipt;
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchLeaderboard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read all entries from the ledger and aggregate per-user scores.
 *
 * @param {string} rpcUrl           - JSON-RPC provider URL
 * @param {string} contractAddress  - Deployed LuminaLedger address
 * @param {number} [topN=10]        - How many top users to return
 * @returns {Promise<Array<{user: string, score: bigint, entryCount: number}>>}
 */
async function fetchLeaderboard(rpcUrl, contractAddress, topN = 10) {
  _assertNonEmpty(rpcUrl,          "rpcUrl");
  _assertNonEmpty(contractAddress, "contractAddress");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const ledger   = new ethers.Contract(contractAddress, LUMINA_LEDGER_ABI, provider);

  const total = await ledger.entryCount();
  const n     = Number(total);
  console.log(`  Fetching ${n} entries…`);

  const scoreMap = new Map(); // address → { score, count }

  for (let i = 0; i < n; i++) {
    const entry = await ledger.getEntry(i);
    const user  = entry.user.toLowerCase();
    const cur   = scoreMap.get(user) ?? { score: 0n, entryCount: 0 };
    scoreMap.set(user, {
      score:      cur.score + entry.impactScore,
      entryCount: cur.entryCount + 1,
    });
  }

  const sorted = [...scoreMap.entries()]
    .map(([user, data]) => ({ user, ...data }))
    .sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : 0))
    .slice(0, topN);

  return sorted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _assertNonEmpty(val, name) {
  if (!val || String(val).trim() === "") {
    throw new Error(`submit: "${name}" must not be empty`);
  }
}

module.exports = { submitEntry, fetchLeaderboard };
