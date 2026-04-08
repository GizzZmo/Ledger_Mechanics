# Lumina Dashboard

A Next.js 14 web dashboard that displays the **Lumina Ledger** leaderboard and recent impact entries, reading data directly from the smart contract via ethers.js.

## Prerequisites

- Node.js ≥ 18
- A running Ethereum node (local Hardhat / Anvil, or testnet)
- Deployed `LuminaLedger` and `LuminaAura` contracts

## Quick Start

```bash
# Install dependencies
npm install

# Development server (mock data shown when no contract configured)
npm run dev

# Open http://localhost:3000
```

## Environment Variables

Create a `.env.local` file (never committed):

```bash
NEXT_PUBLIC_LEDGER_ADDRESS=0xYourLuminaLedgerAddress
NEXT_PUBLIC_AURA_ADDRESS=0xYourLuminaAuraAddress
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
NEXT_PUBLIC_NODE_API_URL=http://localhost:8080
NEXT_PUBLIC_CHAIN_ID=11155111
```

| Variable                    | Description                                   |
|-----------------------------|-----------------------------------------------|
| `NEXT_PUBLIC_LEDGER_ADDRESS`| Deployed LuminaLedger contract address        |
| `NEXT_PUBLIC_AURA_ADDRESS`  | Deployed LuminaAura contract address          |
| `NEXT_PUBLIC_RPC_URL`       | Ethereum JSON-RPC endpoint                    |
| `NEXT_PUBLIC_NODE_API_URL`  | Go light client node base URL (optional)      |
| `NEXT_PUBLIC_CHAIN_ID`      | Chain ID (1=mainnet, 11155111=sepolia, 31337=hardhat) |

## Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with React Query provider
│   │   └── page.tsx            # Main leaderboard page
│   ├── components/
│   │   ├── EntryCard.tsx       # Card for a single impact entry
│   │   └── Leaderboard.tsx     # Ranked leaderboard table
│   ├── lib/
│   │   └── contract.ts         # ethers.js contract helpers & data fetchers
│   └── types/
│       └── index.ts            # Shared TypeScript types
├── next.config.js
└── package.json
```

## Features

- **Live leaderboard** — ranked by cumulative on-chain impact score
- **Recent entries** — shows category, quantity, score, and proof hash
- **Mock data** — dashboard is fully functional with no contract configured
- **Dark theme** — purple/indigo design matching the Lumina branding
- **React Query** — smart caching with 1-minute stale time
