// components/Leaderboard.tsx — Ranked leaderboard table
"use client";

import React from "react";
import type { LeaderboardEntry } from "@/types";

interface LeaderboardProps {
  entries:   LeaderboardEntry[];
  isLoading: boolean;
  error?:    string;
}

const RANK_BADGES: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function Leaderboard({ entries, isLoading, error }: LeaderboardProps) {
  if (isLoading) {
    return (
      <div style={{ color: "var(--dim)", padding: "2rem 0", textAlign: "center" }}>
        Loading leaderboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        color:        "#f87171",
        background:   "#1f0000",
        padding:      "1rem 1.25rem",
        borderRadius: "8px",
        fontSize:     "0.85rem",
      }}>
        Failed to load leaderboard: {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ color: "var(--dim)", padding: "2rem 0", textAlign: "center" }}>
        No entries yet. Be the first to submit an impact entry!
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width:          "100%",
        borderCollapse: "separate",
        borderSpacing:  "0 0.4rem",
        fontSize:       "0.85rem",
      }}>
        <thead>
          <tr style={{ color: "var(--dim)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <Th align="center">Rank</Th>
            <Th>User</Th>
            <Th align="right">Impact Score</Th>
            <Th align="right">Entries</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <LeaderboardRow key={entry.user} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const badge    = RANK_BADGES[entry.rank] ?? String(entry.rank);
  const isTop3   = entry.rank <= 3;

  return (
    <tr style={{
      background:   "var(--surface)",
      borderRadius: "8px",
      transition:   "background 0.15s",
    }}>
      <Td align="center" style={{ borderRadius: "8px 0 0 8px", width: "3rem" }}>
        <span style={{
          fontSize:   isTop3 ? "1.1rem" : "0.85rem",
          color:      isTop3 ? undefined : "var(--dim)",
          fontWeight: isTop3 ? "700" : "400",
        }}>
          {badge}
        </span>
      </Td>

      <Td style={{ fontFamily: "monospace" }}>
        <span title={entry.user} style={{ color: isTop3 ? "var(--accent)" : "var(--muted)" }}>
          {entry.userShort}
        </span>
      </Td>

      <Td align="right" style={{
        fontWeight: "700",
        fontSize:   "1rem",
        color:      "var(--accent)",
      }}>
        {entry.scoreDisplay}
      </Td>

      <Td align="right" style={{ borderRadius: "0 8px 8px 0", color: "var(--dim)" }}>
        {entry.entryCount}
      </Td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Th({ children, align, style }: {
  children?: React.ReactNode;
  align?:    "left" | "right" | "center";
  style?:    React.CSSProperties;
}) {
  return (
    <th style={{
      textAlign:  align ?? "left",
      padding:    "0.5rem 0.75rem",
      fontWeight: "600",
      ...style,
    }}>
      {children}
    </th>
  );
}

function Td({ children, align, style }: {
  children?: React.ReactNode;
  align?:    "left" | "right" | "center";
  style?:    React.CSSProperties;
}) {
  return (
    <td style={{
      textAlign: align ?? "left",
      padding:   "0.65rem 0.75rem",
      ...style,
    }}>
      {children}
    </td>
  );
}
