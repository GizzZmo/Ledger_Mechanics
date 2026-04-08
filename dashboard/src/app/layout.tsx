// app/layout.tsx — Root layout with React Query provider
"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            60_000,   // 1 min
      gcTime:               300_000,  // 5 min
      retry:                2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lumina Ledger</title>
        <meta name="description" content="Lumina Ledger Mechanics — Impact on-chain dashboard" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          :root {
            --bg:        #0d0520;
            --surface:   #1a0a3c;
            --border:    #2e1065;
            --accent:    #a78bfa;
            --accent2:   #7c3aed;
            --text:      #e9d5ff;
            --muted:     #c4b5fd;
            --dim:       #7c6fae;
            --energy:    #34d399;
            --capital:   #fbbf24;
            --behavior:  #60a5fa;
          }

          body {
            font-family: "SF Mono", "Fira Code", monospace;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
          }

          a { color: var(--accent); text-decoration: none; }
          a:hover { text-decoration: underline; }

          .container {
            max-width: 1100px;
            margin: 0 auto;
            padding: 0 1.5rem;
          }

          header {
            border-bottom: 1px solid var(--border);
            padding: 1.25rem 0;
          }

          header .logo {
            font-size: 1.35rem;
            font-weight: 700;
            color: var(--accent);
            letter-spacing: 0.05em;
          }

          footer {
            border-top: 1px solid var(--border);
            padding: 1.25rem 0;
            text-align: center;
            color: var(--dim);
            font-size: 0.78rem;
          }
        `}</style>
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <header>
            <div className="container">
              <span className="logo">✦ Lumina Ledger</span>
            </div>
          </header>

          <main className="container" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
            {children}
          </main>

          <footer>
            <div className="container">
              Lumina Ledger Mechanics · Open Source ·{" "}
              <a href="https://github.com/GizzZmo/Ledger_Mechanics" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </footer>
        </QueryClientProvider>
      </body>
    </html>
  );
}
