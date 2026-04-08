# ✦ Lumina Ledger Mechanics

> Immutable, blockchain-native impact accounting for Project LUMINA.

Lumina Ledger is a full-stack decentralised system that lets users submit **verifiable sustainability actions** — energy saved, capital redirected, behavioural changes — and receive an on-chain reputation score via a **soulbound NFT (LuminaAura)**.

---

## Repository Layout

```
Ledger_Mechanics/
├── contracts/          # Solidity smart contracts (Hardhat)
│   ├── src/
│   │   ├── LuminaLedger.sol    # Core entry ledger
│   │   ├── LuminaVerifier.sol  # Impact score computation + challenge
│   │   └── LuminaAura.sol      # Soulbound ERC-721 reputation NFT
│   ├── test/           # Hardhat/Mocha test suites
│   ├── hardhat.config.js
│   └── package.json
│
├── tracker/            # Node.js CLI tracker
│   ├── src/
│   │   ├── index.js    # CLI entry point (commander)
│   │   ├── proof.js    # Proof generation (ethers.js keccak256)
│   │   ├── submit.js   # On-chain submission + leaderboard fetch
│   │   └── categorize.js # AI spend categorisation (Groq / mock)
│   └── package.json
│
├── node/               # Go light client node (pure stdlib)
│   ├── main.go         # HTTP server + graceful shutdown
│   ├── sync.go         # Block sync, event parsing, EntryStore
│   ├── verify.go       # Off-chain impact score recomputation
│   └── go.mod
│
├── dashboard/          # Next.js 14 leaderboard dashboard
│   ├── src/
│   │   ├── app/        # App Router (layout + page)
│   │   ├── components/ # EntryCard, Leaderboard
│   │   ├── lib/        # ethers.js contract helpers
│   │   └── types/      # Shared TypeScript types
│   └── package.json
│
└── docs/
    └── architecture.md # Full system architecture
```

---

## Quick Start

### 1 — Smart Contracts

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test

# Start a local node and deploy
npx hardhat node &
npx hardhat run scripts/deploy.js --network localhost
```

### 2 — CLI Tracker

```bash
cd tracker
npm install

# Dry-run proof generation (no blockchain needed)
node src/index.js submit --category energy --quantity 50 --mock

# Categorise a spend description
node src/index.js categorize --description "Installed solar panels" --mock
```

### 3 — Go Light Client Node

```bash
cd node
go build -o lumina-node ./...

LISTEN_ADDR=:8080 \
RPC_URL=http://127.0.0.1:8545 \
LEDGER_ADDRESS=0xYourContractAddress \
./lumina-node
```

### 4 — Next.js Dashboard

```bash
cd dashboard
npm install

# Copy and edit environment
cp .env.example .env.local   # set NEXT_PUBLIC_LEDGER_ADDRESS etc.

npm run dev
# Open http://localhost:3000
```

---

## Impact Score Formula

```
ImpactScore = (delta × coeff / baseline) × multiplier × verifierCount

category    coeff    multiplier
────────    ─────    ──────────
energy      1.0      2
capital     0.5      1
behavior    1.0      3

baseline = 100 (configurable)
```

Scores are stored as fixed-point integers ×1e6 for precision.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Soulbound NFT** | Reputation cannot be bought or transferred; one per address |
| **On-chain SVG** | No IPFS dependency; metadata survives any off-chain failure |
| **Proof hashes** | Raw evidence stays off-chain; only the commitment is stored |
| **Merkle roots** | Batches of private entries can be aggregated without revealing individual data |
| **Go node** | Zero-dependency light client for environments where Node.js is unavailable |
| **Mock modes** | Every component works standalone for local development and testing |

---

## Environment Variables (summary)

| Component  | Variable                     | Purpose                          |
|------------|------------------------------|----------------------------------|
| tracker    | `RPC_URL`                    | Ethereum RPC endpoint            |
| tracker    | `SIGNER_KEY`                 | Private key for signing txs      |
| tracker    | `LEDGER_ADDRESS`             | Deployed LuminaLedger address    |
| tracker    | `GROQ_API_KEY`               | Groq AI categorisation key       |
| node       | `LEDGER_ADDRESS`             | Deployed LuminaLedger address    |
| node       | `POLL_INTERVAL`              | Block polling interval (e.g. 12s)|
| dashboard  | `NEXT_PUBLIC_LEDGER_ADDRESS` | Deployed LuminaLedger address    |
| dashboard  | `NEXT_PUBLIC_RPC_URL`        | Ethereum RPC endpoint            |

---

## Licence

MIT — see [LICENSE](./LICENSE).
