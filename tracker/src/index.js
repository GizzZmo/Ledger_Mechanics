#!/usr/bin/env node
"use strict";

/**
 * Lumina Ledger — CLI Tracker
 * Usage: lumina-tracker <command> [options]
 */

const { program } = require("commander");
const { generateProof } = require("./proof");
const { submitEntry }   = require("./submit");
const { categorizeSpend } = require("./categorize");
const pkg = require("../package.json");

program
  .name("lumina-tracker")
  .description("CLI for submitting impact entries to the Lumina Ledger")
  .version(pkg.version);

// ── submit ────────────────────────────────────────────────────────────────────

program
  .command("submit")
  .description("Generate a proof and submit an impact entry to the ledger")
  .requiredOption("-c, --category <type>",   "Entry category: energy | capital | behavior")
  .requiredOption("-q, --quantity <number>",  "Measured quantity (kWh, USD cents, units)")
  .option("-r, --rpc <url>",                  "JSON-RPC endpoint",        process.env.RPC_URL        || "http://127.0.0.1:8545")
  .option("-k, --key <privateKey>",           "Signer private key",        process.env.SIGNER_KEY     || "")
  .option("-a, --address <contractAddress>",  "LuminaLedger contract address", process.env.LEDGER_ADDRESS || "")
  .option("--mock",                           "Dry-run — do not send transaction", false)
  .action(async (opts) => {
    try {
      const categoryMap = { energy: 0, capital: 1, behavior: 2 };
      const categoryCode = categoryMap[opts.category.toLowerCase()];
      if (categoryCode === undefined) {
        console.error(`Unknown category "${opts.category}". Use: energy | capital | behavior`);
        process.exit(1);
      }

      const quantity = Number(opts.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        console.error("Quantity must be a positive number.");
        process.exit(1);
      }

      console.log(`\n📋  Generating proof for ${opts.category} entry (qty=${quantity})…`);
      const { proofHash, merkleRoot } = await generateProof({
        category: categoryCode,
        quantity,
        timestamp: Date.now(),
      });
      console.log(`✅  proofHash  : ${proofHash}`);
      console.log(`✅  merkleRoot : ${merkleRoot}`);

      if (opts.mock) {
        console.log("\n🔶  Mock mode — skipping blockchain submission.");
        console.log("    Entry payload:", { category: categoryCode, quantity, proofHash, merkleRoot });
        return;
      }

      if (!opts.key || !opts.address) {
        console.error("\nError: --key and --address are required for live submission.");
        console.error("       Use --mock for a dry-run.");
        process.exit(1);
      }

      console.log("\n🚀  Submitting entry to contract…");
      const receipt = await submitEntry({
        rpcUrl:   opts.rpc,
        privateKey: opts.key,
        contractAddress: opts.address,
        category: categoryCode,
        quantity,
        proofHash,
        merkleRoot,
      });
      console.log(`\n🎉  Entry submitted! tx: ${receipt.hash}  block: ${receipt.blockNumber}`);
    } catch (err) {
      console.error("Fatal:", err.message);
      process.exit(1);
    }
  });

// ── proof ─────────────────────────────────────────────────────────────────────

program
  .command("proof")
  .description("Generate a proof hash without submitting")
  .requiredOption("-c, --category <type>",  "Entry category: energy | capital | behavior")
  .requiredOption("-q, --quantity <number>", "Measured quantity")
  .option("--json", "Output raw JSON", false)
  .action(async (opts) => {
    try {
      const categoryMap = { energy: 0, capital: 1, behavior: 2 };
      const categoryCode = categoryMap[opts.category.toLowerCase()];
      if (categoryCode === undefined) {
        console.error(`Unknown category "${opts.category}".`);
        process.exit(1);
      }

      const result = await generateProof({
        category:  categoryCode,
        quantity:  Number(opts.quantity),
        timestamp: Date.now(),
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`proofHash  : ${result.proofHash}`);
        console.log(`merkleRoot : ${result.merkleRoot}`);
        console.log(`salt       : ${result.salt}`);
      }
    } catch (err) {
      console.error("Fatal:", err.message);
      process.exit(1);
    }
  });

// ── categorize ────────────────────────────────────────────────────────────────

program
  .command("categorize")
  .description("AI-assisted categorisation of a spend description")
  .requiredOption("-d, --description <text>", "Natural-language spend description")
  .option("--api-key <key>", "Groq API key", process.env.GROQ_API_KEY || "")
  .option("--mock", "Use mock response (no API call)", false)
  .action(async (opts) => {
    try {
      console.log(`\n🤖  Categorising: "${opts.description}"…`);
      const result = await categorizeSpend(opts.description, {
        apiKey: opts.apiKey,
        mock:   opts.mock || !opts.apiKey,
      });
      console.log(`\n📂  Category      : ${result.category}`);
      console.log(`📊  Confidence    : ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`💬  Reasoning     : ${result.reasoning}`);
    } catch (err) {
      console.error("Fatal:", err.message);
      process.exit(1);
    }
  });

// ── leaderboard ───────────────────────────────────────────────────────────────

program
  .command("leaderboard")
  .description("Print top users from the ledger contract")
  .option("-r, --rpc <url>",                 "JSON-RPC endpoint",        process.env.RPC_URL        || "http://127.0.0.1:8545")
  .option("-a, --address <contractAddress>", "LuminaLedger contract address", process.env.LEDGER_ADDRESS || "")
  .option("-n, --top <number>",              "Number of top entries",    "10")
  .action(async (opts) => {
    try {
      if (!opts.address) {
        console.error("Error: --address is required.");
        process.exit(1);
      }
      const { fetchLeaderboard } = require("./submit");
      const board = await fetchLeaderboard(opts.rpc, opts.address, Number(opts.top));
      console.log("\n🏆  Lumina Leaderboard\n");
      board.forEach((entry, i) => {
        console.log(`  ${String(i + 1).padStart(2)}.  ${entry.user}  →  score: ${entry.score}`);
      });
    } catch (err) {
      console.error("Fatal:", err.message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
