# Lumina Ledger Mechanics — Architecture Overview

## System Overview

Lumina Ledger is a decentralised impact-accounting system that lets users submit verifiable sustainability actions (energy saved, capital redirected, behaviour changes) to the blockchain and receive an on-chain reputation score via a soulbound NFT.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LUMINA LEDGER SYSTEM                          │
│                                                                         │
│  User / Organisation                                                    │
│       │                                                                 │
│       │  1. Measure (kWh / USD / behaviour units)                       │
│       ▼                                                                 │
│  ┌──────────────┐    2. Generate proof    ┌──────────────────────────┐  │
│  │  CLI Tracker │ ─────────────────────▶ │   LuminaLedger.sol       │  │
│  │  (Node.js)   │    submitEntry()        │   (Ethereum L1/L2)       │  │
│  └──────────────┘                         │                          │  │
│                                           │  ┌────────────────────┐  │  │
│                                           │  │ LuminaVerifier.sol │  │  │
│                                           │  │ computeImpactScore │  │  │
│                                           │  │ challengeEntry     │  │  │
│                                           │  └────────────────────┘  │  │
│                                           │                          │  │
│                                           │  ┌────────────────────┐  │  │
│                                           │  │  LuminaAura.sol    │  │  │
│                                           │  │  Soulbound NFT     │  │  │
│                                           │  │  (reputation token)│  │  │
│                                           │  └────────────────────┘  │  │
│                                           └──────────────────────────┘  │
│                                                       │                 │
│                                           3. EntrySubmitted event        │
│                                                       │                 │
│                                                       ▼                 │
│                                           ┌──────────────────────────┐  │
│                                           │   Go Light Client Node   │  │
│                                           │   - Block sync           │  │
│                                           │   - Event indexing       │  │
│                                           │   - Off-chain verify     │  │
│                                           │   - REST API             │  │
│                                           └──────────────────────────┘  │
│                                                       │                 │
│                                           4. REST API queries            │
│                                                       │                 │
│                                                       ▼                 │
│                                           ┌──────────────────────────┐  │
│                                           │   Next.js Dashboard      │  │
│                                           │   - Leaderboard          │  │
│                                           │   - Entry cards          │  │
│                                           │   - React Query cache    │  │
│                                           └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Smart Contracts (`contracts/`)

| Contract            | Purpose                                              |
|---------------------|------------------------------------------------------|
| `LuminaLedger.sol`  | Accepts and stores impact entries; orchestrates scoring and NFT minting |
| `LuminaVerifier.sol`| Computes impact scores; accepts peer verifications and challenges |
| `LuminaAura.sol`    | ERC-721 soulbound NFT; one token per user; score embedded in on-chain SVG |

#### Impact Score Formula

```
ImpactScore = (delta × coeff / baseline) × multiplier × verifierCount

where:
  delta        = quantity × 1e6  (fixed-point scaling)
  coeff        = 1.0 for Energy/Behavior, 0.5 for Capital
  baseline     = 100 × 1e6  (configurable by owner)
  multiplier   = 2 (Energy), 1 (Capital), 3 (Behavior)
  verifierCount= number of peer verifiers + 1 (default)
```

#### LuminaEntry Struct

```solidity
struct LuminaEntry {
    uint256 timestamp;
    address user;
    uint8   category;      // 0=energy, 1=capital, 2=behavior
    uint256 quantity;      // kWh | USD cents | behaviour units
    bytes32 proofHash;     // keccak256 of off-chain evidence
    uint256 impactScore;   // computed score (×1e6)
    bytes32 merkleRoot;    // batch-privacy Merkle root
}
```

#### Soulbound NFT (LuminaAura)

- Extends OpenZeppelin ERC-721
- Overrides `_update()` to revert on any transfer after minting (soulbound)
- One token per address; score updated in-place on each new entry
- `tokenURI()` returns fully on-chain SVG metadata (no IPFS dependency)

---

### 2. CLI Tracker (`tracker/`)

A Node.js CLI built with **commander**. Standalone — works without a live chain using `--mock`.

| Module          | Purpose                                              |
|-----------------|------------------------------------------------------|
| `index.js`      | CLI entry point; sub-commands: submit, proof, categorize, leaderboard |
| `proof.js`      | keccak256 proof generation via `ethers.solidityPacked` |
| `submit.js`     | ethers.js wallet + contract transaction submission   |
| `categorize.js` | AI-assisted spend categorisation (Groq API or local rule-based mock) |

**Proof generation** uses `keccak256(abi.encodePacked(category, quantity, timestamp, extra, salt))` — identical to the on-chain verification hash, ensuring tamper evidence.

---

### 3. Go Light Client Node (`node/`)

A lightweight HTTP server in pure Go (no external dependencies).

| File        | Purpose                                              |
|-------------|------------------------------------------------------|
| `main.go`   | HTTP routes, graceful shutdown, config from env vars |
| `sync.go`   | JSON-RPC block polling, `eth_getLogs` for EntrySubmitted, in-memory EntryStore |
| `verify.go` | Replicates Solidity impact score formula for off-chain spot-checks |

REST endpoints: `/health`, `/entries`, `/entries/{id}`, `/leaderboard`, `/verify/{id}`, `/sync/status`

---

### 4. Next.js Dashboard (`dashboard/`)

A React 18 + Next.js 14 app (App Router) with:

- **React Query** for data fetching with 1-min stale caching
- **ethers.js** for direct contract reads (no server-side dependency)
- Fully functional in **mock mode** when no contract is configured
- Dark-themed inline CSS (no external CSS framework)

---

## Data Flow

```
Submitter
  │
  ├─ tracker CLI: generateProof(category, quantity)
  │     → proofHash = keccak256(ABI-encoded evidence)
  │
  ├─ tracker CLI: submitEntry(category, quantity, proofHash, merkleRoot)
  │     → LuminaLedger.submitEntry()
  │           → LuminaVerifier.computeImpactScore()
  │           → LuminaAura.mintOrUpdate()
  │           → emit EntrySubmitted
  │
  ├─ Go Node: eth_getLogs polls EntrySubmitted
  │     → parses ABI-encoded log data
  │     → stores in EntryStore
  │     → exposes via REST API
  │
  └─ Dashboard: React Query fetches /leaderboard + /entries
        → renders Leaderboard + EntryCards
```

---

## Security Considerations

- **Double-submission protection**: `usedProofs` mapping prevents reuse of proof hashes.
- **Soulbound enforcement**: `_update()` revert prevents all ERC-721 transfers post-mint.
- **Access control**: `mintOrUpdate` restricted to the LuminaLedger address; admin functions restricted to owner.
- **Challenge mechanism**: Any address can raise a challenge; owner resolves (intended for DAO governance later).
- **No secrets in proofs**: Proof hashes are commitments to evidence; raw data stays off-chain.

---

## Deployment

1. `cd contracts && npm install && npx hardhat compile`
2. Deploy with `npx hardhat run scripts/deploy.js --network sepolia`
3. Set contract addresses in `tracker/.env` and `dashboard/.env.local`
4. `cd node && go build -o lumina-node && LEDGER_ADDRESS=0x... ./lumina-node`
5. `cd dashboard && npm install && npm run build && npm start`
