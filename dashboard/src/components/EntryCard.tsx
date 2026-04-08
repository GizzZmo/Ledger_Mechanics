// components/EntryCard.tsx — Card component for displaying a single LuminaEntry
"use client";

import React from "react";
import type { LuminaEntry } from "@/types";
import { CATEGORY_LABELS, CATEGORY_ICONS } from "@/types";
import { shortenAddress, formatScore, formatTimestamp } from "@/lib/contract";

interface EntryCardProps {
  entry: LuminaEntry;
}

const CATEGORY_COLORS: Record<number, string> = {
  0: "var(--energy)",
  1: "var(--capital)",
  2: "var(--behavior)",
};

export function EntryCard({ entry }: EntryCardProps) {
  const color       = CATEGORY_COLORS[entry.category] ?? "var(--accent)";
  const icon        = CATEGORY_ICONS[entry.category]  ?? "🔹";
  const label       = CATEGORY_LABELS[entry.category] ?? "Unknown";
  const scoreStr    = formatScore(entry.impactScore);
  const quantityStr = entry.quantity.toString();
  const dateStr     = formatTimestamp(entry.timestamp);

  return (
    <article style={{
      background:   "var(--surface)",
      border:       `1px solid var(--border)`,
      borderLeft:   `3px solid ${color}`,
      borderRadius: "10px",
      padding:      "1.1rem 1.25rem",
      display:      "grid",
      gap:          "0.55rem",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize:     "0.75rem",
          fontWeight:   "700",
          color,
          background:   `${color}18`,
          padding:      "0.2rem 0.6rem",
          borderRadius: "999px",
          letterSpacing:"0.04em",
        }}>
          {icon} {label}
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--dim)" }}>
          #{entry.id}
        </span>
      </div>

      {/* Score */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--accent)" }}>
          {scoreStr}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--dim)" }}>impact pts</span>
      </div>

      {/* Details */}
      <dl style={{
        display:             "grid",
        gridTemplateColumns: "auto 1fr",
        gap:                 "0.2rem 0.75rem",
        fontSize:            "0.78rem",
      }}>
        <dt style={{ color: "var(--dim)" }}>User</dt>
        <dd style={{ color: "var(--muted)", fontFamily: "monospace" }}>
          {shortenAddress(entry.user)}
        </dd>

        <dt style={{ color: "var(--dim)" }}>Quantity</dt>
        <dd style={{ color: "var(--text)" }}>
          {quantityStr}{" "}
          <span style={{ color: "var(--dim)" }}>
            {label === "Energy" ? "kWh" : label === "Capital" ? "USD¢" : "units"}
          </span>
        </dd>

        <dt style={{ color: "var(--dim)" }}>Proof</dt>
        <dd style={{
          color:        "var(--muted)",
          fontFamily:   "monospace",
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {entry.proofHash.slice(0, 14)}…
        </dd>

        <dt style={{ color: "var(--dim)" }}>Date</dt>
        <dd style={{ color: "var(--dim)", fontSize: "0.72rem" }}>{dateStr}</dd>
      </dl>
    </article>
  );
}
