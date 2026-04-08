// lib/contract.ts — Contract interaction helpers for Lumina Ledger Dashboard
import { ethers } from "ethers";
import type { ContractConfig, LuminaEntry, LeaderboardEntry } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// ABIs (minimal — only the functions the dashboard uses)
// ─────────────────────────────────────────────────────────────────────────────

export const LUMINA_LEDGER_ABI = [
  "function entryCount() view returns (uint256)",
  "function getEntry(uint256 entryId) view returns (tuple(uint256 timestamp, address user, uint8 category, uint256 quantity, bytes32 proofHash, uint256 impactScore, bytes32 merkleRoot))",
  "function userScore(address user) view returns (uint256)",
  "function getEntriesByUser(address user) view returns (tuple(uint256 timestamp, address user, uint8 category, uint256 quantity, bytes32 proofHash, uint256 impactScore, bytes32 merkleRoot)[])",
  "event EntrySubmitted(uint256 indexed entryId, address indexed user, uint8 category, uint256 quantity, uint256 impactScore, bytes32 proofHash)",
] as const;

export const LUMINA_AURA_ABI = [
  "function auraOf(address user) view returns (uint256)",
  "function scoreOf(uint256 tokenId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getContractConfig(): ContractConfig {
  return {
    ledgerAddress: process.env.NEXT_PUBLIC_LEDGER_ADDRESS ?? "",
    auraAddress:   process.env.NEXT_PUBLIC_AURA_ADDRESS   ?? "",
    rpcUrl:        process.env.NEXT_PUBLIC_RPC_URL        ?? "http://127.0.0.1:8545",
    chainId:       Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider / contract factories
// ─────────────────────────────────────────────────────────────────────────────

export function getProvider(rpcUrl: string): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl);
}

export function getLedgerContract(
  address: string,
  provider: ethers.Provider
): ethers.Contract {
  return new ethers.Contract(address, LUMINA_LEDGER_ABI, provider);
}

export function getAuraContract(
  address: string,
  provider: ethers.Provider
): ethers.Contract {
  return new ethers.Contract(address, LUMINA_AURA_ABI, provider);
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetchers
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a single entry by ID. */
export async function fetchEntry(
  contractAddress: string,
  provider: ethers.Provider,
  id: number
): Promise<LuminaEntry> {
  const contract = getLedgerContract(contractAddress, provider);
  const raw = await contract.getEntry(id);
  return mapEntry(id, raw);
}

/** Fetch the most recent `limit` entries (newest first). */
export async function fetchRecentEntries(
  contractAddress: string,
  provider: ethers.Provider,
  limit = 20
): Promise<LuminaEntry[]> {
  const contract = getLedgerContract(contractAddress, provider);
  const total = Number(await contract.entryCount());
  const results: LuminaEntry[] = [];

  const start = Math.max(0, total - limit);
  const fetches = Array.from({ length: total - start }, (_, i) =>
    contract.getEntry(start + i).then((raw: unknown[]) => mapEntry(start + i, raw))
  );

  const settled = await Promise.allSettled(fetches);
  for (const s of settled) {
    if (s.status === "fulfilled") results.push(s.value);
  }

  return results.reverse();
}

/** Build a leaderboard from all entries on-chain. */
export async function fetchLeaderboard(
  contractAddress: string,
  provider: ethers.Provider,
  topN = 10
): Promise<LeaderboardEntry[]> {
  const contract = getLedgerContract(contractAddress, provider);
  const total = Number(await contract.entryCount());

  const fetches = Array.from({ length: total }, (_, i) =>
    contract.getEntry(i).then((raw: unknown[]) => mapEntry(i, raw))
  );

  const settled = await Promise.allSettled(fetches);
  const entries: LuminaEntry[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") entries.push(s.value);
  }

  // Aggregate per user
  const scoreMap = new Map<string, { score: bigint; count: number }>();
  for (const e of entries) {
    const key = e.user.toLowerCase();
    const cur = scoreMap.get(key) ?? { score: 0n, count: 0 };
    scoreMap.set(key, { score: cur.score + e.impactScore, count: cur.count + 1 });
  }

  const sorted = [...scoreMap.entries()]
    .map(([user, data]) => ({ user, ...data }))
    .sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : 0))
    .slice(0, topN);

  return sorted.map((row, idx) => ({
    rank:         idx + 1,
    user:         row.user,
    userShort:    shortenAddress(row.user),
    totalScore:   row.score,
    scoreDisplay: formatScore(row.score),
    entryCount:   row.count,
  }));
}

/** Fetch all entries for a specific user. */
export async function fetchUserEntries(
  contractAddress: string,
  provider: ethers.Provider,
  user: string
): Promise<LuminaEntry[]> {
  const contract = getLedgerContract(contractAddress, provider);
  const raws = await contract.getEntriesByUser(user);
  return (raws as unknown[][]).map((raw, i) => mapEntry(i, raw));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEntry(id: number, raw: any): LuminaEntry {
  return {
    id,
    timestamp:   Number(raw[0] ?? raw.timestamp),
    user:        String(raw[1] ?? raw.user),
    category:    Number(raw[2] ?? raw.category) as 0 | 1 | 2,
    quantity:    BigInt(raw[3] ?? raw.quantity),
    proofHash:   String(raw[4] ?? raw.proofHash),
    impactScore: BigInt(raw[5] ?? raw.impactScore),
    merkleRoot:  String(raw[6] ?? raw.merkleRoot),
  };
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Format a fixed-point score (×1e6) as a readable decimal. */
export function formatScore(score: bigint): string {
  const whole    = score / 1_000_000n;
  const fraction = score % 1_000_000n;
  const fStr     = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return fStr.length > 0 ? `${whole}.${fStr}` : `${whole}`;
}

/** Format a Unix timestamp (seconds) as a locale date string. */
export function formatTimestamp(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}
