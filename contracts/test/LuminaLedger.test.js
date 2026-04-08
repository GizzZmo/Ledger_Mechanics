const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("LuminaLedger", function () {
  let ledger, verifier, aura;
  let owner, alice, bob;

  const CATEGORY_ENERGY   = 0;
  const CATEGORY_CAPITAL  = 1;
  const CATEGORY_BEHAVIOR = 2;

  // Helper: produce a deterministic proof hash
  function makeProofHash(user, data) {
    return ethers.keccak256(ethers.toUtf8Bytes(`${user}:${data}`));
  }

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("LuminaVerifier");
    verifier = await Verifier.deploy();

    const Aura = await ethers.getContractFactory("LuminaAura");
    aura = await Aura.deploy();

    const Ledger = await ethers.getContractFactory("LuminaLedger");
    ledger = await Ledger.deploy(await verifier.getAddress(), await aura.getAddress());

    // Authorise ledger to mint Aura tokens
    await aura.setLedger(await ledger.getAddress());
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("links to the correct verifier and aura contracts", async function () {
      expect(await ledger.verifier()).to.equal(await verifier.getAddress());
      expect(await ledger.aura()).to.equal(await aura.getAddress());
    });

    it("starts with zero entries", async function () {
      expect(await ledger.entryCount()).to.equal(0n);
    });
  });

  // ── submitEntry ────────────────────────────────────────────────────────────

  describe("submitEntry", function () {
    it("stores an entry and increments entryCount", async function () {
      const proof = makeProofHash(alice.address, "50kWh");
      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 50, proof, ethers.ZeroHash);

      expect(await ledger.entryCount()).to.equal(1n);

      const entry = await ledger.getEntry(0);
      expect(entry.user).to.equal(alice.address);
      expect(entry.category).to.equal(CATEGORY_ENERGY);
      expect(entry.quantity).to.equal(50n);
      expect(entry.proofHash).to.equal(proof);
    });

    it("emits EntrySubmitted event", async function () {
      const proof = makeProofHash(alice.address, "100kWh");
      await expect(
        ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 100, proof, ethers.ZeroHash)
      ).to.emit(ledger, "EntrySubmitted")
        .withArgs(0n, alice.address, CATEGORY_ENERGY, 100n, (v) => v > 0n, proof);
    });

    it("accumulates user score", async function () {
      const p1 = makeProofHash(alice.address, "50kWh");
      const p2 = makeProofHash(alice.address, "30kWh-2");
      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 50, p1, ethers.ZeroHash);
      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 30, p2, ethers.ZeroHash);

      const score = await ledger.userScore(alice.address);
      expect(score).to.be.greaterThan(0n);
    });

    it("reverts on zero quantity", async function () {
      const proof = makeProofHash(alice.address, "0kWh");
      await expect(
        ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 0, proof, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(ledger, "ZeroQuantity");
    });

    it("reverts on invalid category", async function () {
      const proof = makeProofHash(alice.address, "bad");
      await expect(
        ledger.connect(alice).submitEntry(99, 10, proof, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(ledger, "InvalidCategory");
    });

    it("reverts on duplicate proof hash", async function () {
      const proof = makeProofHash(alice.address, "dup");
      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 10, proof, ethers.ZeroHash);
      await expect(
        ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 10, proof, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(ledger, "DuplicateProof");
    });

    it("supports all three categories", async function () {
      const p0 = makeProofHash(alice.address, "energy");
      const p1 = makeProofHash(alice.address, "capital");
      const p2 = makeProofHash(alice.address, "behavior");

      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY,   100, p0, ethers.ZeroHash);
      await ledger.connect(alice).submitEntry(CATEGORY_CAPITAL,  200, p1, ethers.ZeroHash);
      await ledger.connect(alice).submitEntry(CATEGORY_BEHAVIOR, 50,  p2, ethers.ZeroHash);

      expect(await ledger.entryCount()).to.equal(3n);
    });
  });

  // ── getEntriesByUser ───────────────────────────────────────────────────────

  describe("getEntriesByUser", function () {
    it("returns only entries belonging to the requested user", async function () {
      const pA1 = makeProofHash(alice.address, "a1");
      const pA2 = makeProofHash(alice.address, "a2");
      const pB1 = makeProofHash(bob.address, "b1");

      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 10, pA1, ethers.ZeroHash);
      await ledger.connect(bob).submitEntry(CATEGORY_ENERGY,   20, pB1, ethers.ZeroHash);
      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 30, pA2, ethers.ZeroHash);

      const aliceEntries = await ledger.getEntriesByUser(alice.address);
      expect(aliceEntries.length).to.equal(2);
      for (const e of aliceEntries) {
        expect(e.user).to.equal(alice.address);
      }

      const bobEntries = await ledger.getEntriesByUser(bob.address);
      expect(bobEntries.length).to.equal(1);
    });

    it("returns empty array for address with no entries", async function () {
      const entries = await ledger.getEntriesByUser(bob.address);
      expect(entries.length).to.equal(0);
    });
  });

  // ── Aura integration ───────────────────────────────────────────────────────

  describe("LuminaAura integration", function () {
    it("mints an Aura NFT on first submission", async function () {
      const proof = makeProofHash(alice.address, "nft-test");
      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 100, proof, ethers.ZeroHash);

      const tokenId = await aura.auraOf(alice.address);
      expect(tokenId).to.be.greaterThan(0n);
      expect(await aura.ownerOf(tokenId)).to.equal(alice.address);
    });

    it("updates Aura score on subsequent submissions without re-minting", async function () {
      const p1 = makeProofHash(alice.address, "s1");
      const p2 = makeProofHash(alice.address, "s2");

      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 50, p1, ethers.ZeroHash);
      const tokenId = await aura.auraOf(alice.address);
      const score1  = await aura.scoreOf(tokenId);

      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 50, p2, ethers.ZeroHash);
      const tokenId2 = await aura.auraOf(alice.address);
      const score2   = await aura.scoreOf(tokenId2);

      expect(tokenId).to.equal(tokenId2); // no new token
      expect(score2).to.be.greaterThan(score1);
    });
  });

  // ── Merkle root ────────────────────────────────────────────────────────────

  describe("Merkle root field", function () {
    it("stores the provided merkle root", async function () {
      const proof  = makeProofHash(alice.address, "batch");
      const mroot  = ethers.keccak256(ethers.toUtf8Bytes("batch-root"));
      await ledger.connect(alice).submitEntry(CATEGORY_ENERGY, 50, proof, mroot);

      const entry = await ledger.getEntry(0);
      expect(entry.merkleRoot).to.equal(mroot);
    });
  });
});
