// app/page.tsx — Main leaderboard page
"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Leaderboard } from "@/components/Leaderboard";
import { EntryCard }    from "@/components/EntryCard";
import {
  fetchLeaderboard,
  fetchRecentEntries,
  getContractConfig,
  getProvider,
} from "@/lib/contract";
import type { LeaderboardEntry, LuminaEntry } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Data hooks
// ─────────────────────────────────────────────────────────────────────────────

function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard"],
    queryFn:  async () => {
      const cfg      = getContractConfig();
      const provider = getProvider(cfg.rpcUrl);
      if (!cfg.ledgerAddress) return MOCK_LEADERBOARD;
      return fetchLeaderboard(cfg.ledgerAddress, provider, 10);
    },
    placeholderData: MOCK_LEADERBOARD,
  });
}

function useRecentEntries() {
  return useQuery<LuminaEntry[]>({
    queryKey: ["entries", "recent"],
    queryFn:  async () => {
      const cfg      = getContractConfig();
      const provider = getProvider(cfg.rpcUrl);
      if (!cfg.ledgerAddress) return MOCK_ENTRIES;
      return fetchRecentEntries(cfg.ledgerAddress, provider, 10);
    },
    placeholderData: MOCK_ENTRIES,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const leaderboard = useLeaderboard();
  const entries     = useRecentEntries();

  return (
    <div style={{ display: "grid", gap: "2.5rem" }}>
      {/* Header */}
      <section>
        <h1 style={{ fontSize: "1.75rem", color: "var(--accent)", marginBottom: "0.5rem" }}>
          Impact Leaderboard
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Real-time ranking of verified impact entries on the Lumina Ledger.
          Scores are computed on-chain and cannot be tampered with.
        </p>
      </section>

      {/* Stats bar */}
      <StatsBar
        totalEntries={entries.data?.length ?? 0}
        uniqueUsers={leaderboard.data?.length ?? 0}
        loading={leaderboard.isLoading}
      />

      {/* Leaderboard */}
      <section>
        <SectionHeader title="🏆 Top Contributors" />
        <Leaderboard
          entries={leaderboard.data ?? []}
          isLoading={leaderboard.isLoading}
          error={leaderboard.error?.message}
        />
      </section>

      {/* Recent entries */}
      <section>
        <SectionHeader title="📋 Recent Entries" />
        {entries.isLoading && <LoadingState />}
        {entries.error && <ErrorState message={entries.error.message} />}
        {entries.data && (
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {entries.data.map((entry) => (
              <EntryCard key={`${entry.id}-${entry.proofHash}`} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 style={{
      fontSize:     "1.15rem",
      color:        "var(--text)",
      marginBottom: "1rem",
      paddingBottom:"0.5rem",
      borderBottom: "1px solid var(--border)",
    }}>
      {title}
    </h2>
  );
}

function StatsBar({ totalEntries, uniqueUsers, loading }: {
  totalEntries: number;
  uniqueUsers:  number;
  loading:      boolean;
}) {
  const stats = [
    { label: "Total Entries",   value: loading ? "…" : totalEntries.toLocaleString() },
    { label: "Active Users",    value: loading ? "…" : uniqueUsers.toLocaleString() },
    { label: "Network",         value: process.env.NEXT_PUBLIC_CHAIN_ID === "1" ? "Mainnet" : "Testnet" },
  ];

  return (
    <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          background:   "var(--surface)",
          border:       "1px solid var(--border)",
          borderRadius: "10px",
          padding:      "1rem 1.5rem",
          minWidth:     "140px",
        }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--accent)" }}>
            {s.value}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--dim)", marginTop: "0.25rem" }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingState() {
  return <p style={{ color: "var(--dim)", padding: "2rem 0" }}>Loading entries…</p>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <p style={{ color: "#f87171", padding: "1rem", background: "#1f0000", borderRadius: "8px" }}>
      Error: {message}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data (shown when no contract is configured)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, user: "0xAlice1234567890abcdef1234567890abcdef12", userShort: "0xAlic…ef12", totalScore: 42_000_000n, scoreDisplay: "42", entryCount: 21 },
  { rank: 2, user: "0xBob1234567890abcdef1234567890abcdef1234", userShort: "0xBob1…1234", totalScore: 30_000_000n, scoreDisplay: "30", entryCount: 15 },
  { rank: 3, user: "0xCarol234567890abcdef1234567890abcdef123", userShort: "0xCaro…f123", totalScore: 18_000_000n, scoreDisplay: "18", entryCount: 9  },
];

const TS = Math.floor(Date.now() / 1000);

const MOCK_ENTRIES: LuminaEntry[] = [
  { id: 0, timestamp: TS - 3600, user: "0xAlice1234567890abcdef1234567890abcdef12", category: 0, quantity: 120n, proofHash: "0xabc123", impactScore: 2_400_000n, merkleRoot: "0x0" },
  { id: 1, timestamp: TS - 7200, user: "0xBob1234567890abcdef1234567890abcdef1234", category: 1, quantity: 500n, proofHash: "0xdef456", impactScore: 2_500_000n, merkleRoot: "0x0" },
  { id: 2, timestamp: TS - 10800, user: "0xCarol234567890abcdef1234567890abcdef123", category: 2, quantity: 80n, proofHash: "0x789abc", impactScore: 2_400_000n, merkleRoot: "0x0" },
];
