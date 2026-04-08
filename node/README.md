# Lumina Light Client Node

A lightweight Go HTTP server that syncs `EntrySubmitted` events from the LuminaLedger smart contract and exposes a REST API for querying entries and verifying impact scores.

## Prerequisites

- Go ≥ 1.22
- A running Ethereum JSON-RPC node (local Hardhat, Anvil, Infura, etc.)

## Build & Run

```bash
# Build
go build -o lumina-node ./...

# Run with environment variables
LISTEN_ADDR=:8080 \
RPC_URL=http://127.0.0.1:8545 \
LEDGER_ADDRESS=0xYourDeployedContract \
POLL_INTERVAL=12s \
START_BLOCK=0 \
./lumina-node
```

## Environment Variables

| Variable          | Default                    | Description                          |
|-------------------|----------------------------|--------------------------------------|
| `LISTEN_ADDR`     | `:8080`                    | HTTP listen address                  |
| `RPC_URL`         | `http://127.0.0.1:8545`    | Ethereum JSON-RPC endpoint           |
| `LEDGER_ADDRESS`  | *(empty — sync disabled)*  | Deployed LuminaLedger address        |
| `POLL_INTERVAL`   | `12s`                      | How often to poll for new blocks     |
| `START_BLOCK`     | `0`                        | Block number to start syncing from   |

## REST API

All responses are JSON.

### `GET /health`

```json
{ "status": "ok", "time": "2024-01-01T00:00:00Z" }
```

### `GET /entries?page=0&limit=50`

Returns paginated list of synced entries.

```json
{
  "count": 2,
  "page": 0,
  "limit": 50,
  "entries": [
    {
      "id": 0,
      "blockNumber": 12345,
      "txHash": "0xabc...",
      "user": "0xalice...",
      "category": 0,
      "quantity": 100,
      "impactScore": 2000000,
      "proofHash": "0xdef...",
      "merkleRoot": "0x000..."
    }
  ]
}
```

### `GET /entries/{id}`

Returns a single entry by its ledger ID.

### `GET /leaderboard?top=10`

Returns the top N users ranked by cumulative impact score.

```json
{
  "leaderboard": [
    { "user": "0xalice...", "totalScore": 6000000, "entryCount": 3 }
  ]
}
```

### `GET /verify/{id}`

Runs off-chain verification on a synced entry.

```json
{
  "entryId": 0,
  "valid": true,
  "expectedScore": 2000000,
  "actualScore": 2000000,
  "scoreMatch": true,
  "category": "energy"
}
```

### `GET /sync/status`

```json
{
  "lastBlock": 12350,
  "entrySynced": 7,
  "contractAddr": "0x...",
  "rpcURL": "http://127.0.0.1:8545"
}
```

## Architecture

- `main.go`  — HTTP server setup, graceful shutdown, route handlers
- `sync.go`  — Background block poller, JSON-RPC client, log parser, `EntryStore`
- `verify.go`— Off-chain impact score recomputation (mirrors Solidity formula)

The node uses **zero external dependencies** — only the Go standard library.
