// ─────────────────────────────────────────────────────────────────────────────
// types/index.ts — Shared TypeScript types for Lumina Ledger Dashboard
// ─────────────────────────────────────────────────────────────────────────────

/** On-chain category codes */
export type CategoryCode = 0 | 1 | 2;

export const CATEGORY_LABELS: Record<CategoryCode, string> = {
  0: "Energy",
  1: "Capital",
  2: "Behavior",
};

export const CATEGORY_ICONS: Record<CategoryCode, string> = {
  0: "⚡",
  1: "💰",
  2: "🌱",
};

/** Mirror of the Solidity LuminaEntry struct */
export interface LuminaEntry {
  /** Sequential entry ID */
  id: number;
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** Submitter address */
  user: string;
  /** 0=energy, 1=capital, 2=behavior */
  category: CategoryCode;
  /** Measured quantity (kWh, USD cents, behaviour units) */
  quantity: bigint;
  /** keccak256 of raw evidence */
  proofHash: string;
  /** Computed impact score (×1e6 fixed-point) */
  impactScore: bigint;
  /** Merkle root for batch privacy */
  merkleRoot: string;
}

/** Per-user aggregated leaderboard row */
export interface LeaderboardEntry {
  rank: number;
  user: string;
  /** Checksummed address abbreviation */
  userShort: string;
  /** Raw cumulative impact score (bigint from contract) */
  totalScore: bigint;
  /** Human-readable score (divided by 1e6) */
  scoreDisplay: string;
  entryCount: number;
}

/** Response from the Go node /leaderboard endpoint */
export interface NodeLeaderboardResponse {
  leaderboard: {
    user: string;
    totalScore: number;
    entryCount: number;
  }[];
}

/** Response from the Go node /entries endpoint */
export interface NodeEntriesResponse {
  count: number;
  page: number;
  limit: number;
  entries: {
    id: number;
    blockNumber: number;
    txHash: string;
    timestamp: number;
    user: string;
    category: number;
    quantity: number;
    impactScore: number;
    proofHash: string;
    merkleRoot: string;
  }[];
}

/** Verification result from the Go node /verify endpoint */
export interface VerificationResult {
  entryId: number;
  valid: boolean;
  expectedScore: number;
  actualScore: number;
  scoreMatch: boolean;
  category: string;
  reason?: string;
}

/** Contract query configuration */
export interface ContractConfig {
  ledgerAddress: string;
  auraAddress: string;
  rpcUrl: string;
  chainId: number;
}
