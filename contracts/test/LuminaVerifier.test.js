const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("LuminaVerifier", function () {
  let verifier;
  let owner, alice, bob;

  const SCALE = 1_000_000n; // 1e6

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Verifier = await ethers.getContractFactory("LuminaVerifier");
    verifier = await Verifier.deploy();
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets deployer as owner", async function () {
      expect(await verifier.owner()).to.equal(owner.address);
    });

    it("initialises with baseline = 100e6", async function () {
      expect(await verifier.baseline()).to.equal(100n * SCALE);
    });

    it("initialises defaultVerifierCount = 1", async function () {
      expect(await verifier.defaultVerifierCount()).to.equal(1n);
    });
  });

  // ── computeImpactScore ─────────────────────────────────────────────────────

  describe("computeImpactScore (2-arg overload)", function () {
    it("energy: score = quantity * multiplier / baseline", async function () {
      // energy: category=0, multiplier=2, coeff=1
      // score = (qty * SCALE * 2 * 1) / (100 * SCALE)
      //       = qty * 2 / 100
      const score = await verifier["computeImpactScore(uint8,uint256)"](0, 100);
      // 100 * 1e6 * 2 * 1 / (100 * 1e6) = 2
      expect(score).to.equal(2n);
    });

    it("capital: applies 0.5 coefficient", async function () {
      // capital: category=1, multiplier=1, coeff=0.5
      // score = (qty * SCALE / 2 * 1 * 1) / (100 * SCALE)
      //       = qty / 200
      const score = await verifier["computeImpactScore(uint8,uint256)"](1, 200);
      // 200 * 1e6 / 2 * 1 * 1 / (100 * 1e6) = 1
      expect(score).to.equal(1n);
    });

    it("behavior: applies multiplier 3", async function () {
      // behavior: category=2, multiplier=3, coeff=1
      // score = (qty * SCALE * 3 * 1) / (100 * SCALE)
      const score = await verifier["computeImpactScore(uint8,uint256)"](2, 100);
      // 100 * 1e6 * 3 / (100 * 1e6) = 3
      expect(score).to.equal(3n);
    });

    it("reverts for invalid category", async function () {
      await expect(
        verifier["computeImpactScore(uint8,uint256)"](5, 100)
      ).to.be.revertedWith("LuminaVerifier: bad category");
    });
  });

  describe("computeImpactScore (3-arg overload with verifierCount)", function () {
    it("scales by verifierCount when entries have been verified", async function () {
      // Verify entry 0 once → verifierCount[0] = 1
      await verifier.verifyEntry(0);
      // default=1, verified=1 → total vcnt = 2
      const score = await verifier["computeImpactScore(uint8,uint256,uint256)"](0, 100, 0);
      // (100*1e6*2*2)/(100*1e6) = 4
      expect(score).to.equal(4n);
    });

    it("uses defaultVerifierCount when entryId has no verifiers", async function () {
      const score3 = await verifier["computeImpactScore(uint8,uint256,uint256)"](0, 100, 999);
      // vcnt = 0 + 1 = 1
      expect(score3).to.equal(2n);
    });
  });

  // ── verifyEntry ────────────────────────────────────────────────────────────

  describe("verifyEntry", function () {
    it("increments verifierCount for the entry", async function () {
      await verifier.connect(alice).verifyEntry(42);
      expect(await verifier.verifierCount(42)).to.equal(1n);

      await verifier.connect(bob).verifyEntry(42);
      expect(await verifier.verifierCount(42)).to.equal(2n);
    });

    it("emits EntryVerified event", async function () {
      await expect(verifier.connect(alice).verifyEntry(7))
        .to.emit(verifier, "EntryVerified")
        .withArgs(7n, alice.address, 1n);
    });
  });

  // ── challengeEntry ─────────────────────────────────────────────────────────

  describe("challengeEntry", function () {
    it("creates a challenge and emits ChallengeSubmitted", async function () {
      await expect(
        verifier.connect(alice).challengeEntry(3, "Fraudulent energy data")
      )
        .to.emit(verifier, "ChallengeSubmitted")
        .withArgs(0n, 3n, alice.address);

      const c = await verifier.challenges(0);
      expect(c.challenger).to.equal(alice.address);
      expect(c.entryId).to.equal(3n);
      expect(c.reason).to.equal("Fraudulent energy data");
      expect(c.resolved).to.be.false;
    });

    it("increments challengeCount", async function () {
      await verifier.connect(alice).challengeEntry(1, "reason A");
      await verifier.connect(bob).challengeEntry(2, "reason B");
      expect(await verifier.challengeCount()).to.equal(2n);
    });
  });

  // ── resolveChallenge ───────────────────────────────────────────────────────

  describe("resolveChallenge", function () {
    beforeEach(async function () {
      await verifier.connect(alice).challengeEntry(5, "Invalid data");
    });

    it("owner can resolve a challenge as upheld", async function () {
      await expect(verifier.connect(owner).resolveChallenge(0, true))
        .to.emit(verifier, "ChallengeResolved")
        .withArgs(0n, true);

      const c = await verifier.challenges(0);
      expect(c.resolved).to.be.true;
      expect(c.upheld).to.be.true;
    });

    it("owner can resolve a challenge as dismissed", async function () {
      await verifier.connect(owner).resolveChallenge(0, false);
      const c = await verifier.challenges(0);
      expect(c.upheld).to.be.false;
    });

    it("reverts if already resolved", async function () {
      await verifier.connect(owner).resolveChallenge(0, true);
      await expect(
        verifier.connect(owner).resolveChallenge(0, false)
      ).to.be.revertedWith("LuminaVerifier: already resolved");
    });

    it("non-owner cannot resolve", async function () {
      await expect(
        verifier.connect(alice).resolveChallenge(0, true)
      ).to.be.revertedWith("LuminaVerifier: not owner");
    });
  });

  // ── Admin functions ────────────────────────────────────────────────────────

  describe("Admin", function () {
    it("owner can update baseline", async function () {
      await expect(verifier.setBaseline(200n * SCALE))
        .to.emit(verifier, "BaselineUpdated")
        .withArgs(200n * SCALE);
      expect(await verifier.baseline()).to.equal(200n * SCALE);
    });

    it("reverts on zero baseline", async function () {
      await expect(verifier.setBaseline(0))
        .to.be.revertedWith("LuminaVerifier: zero baseline");
    });

    it("non-owner cannot update baseline", async function () {
      await expect(verifier.connect(alice).setBaseline(50n * SCALE))
        .to.be.revertedWith("LuminaVerifier: not owner");
    });

    it("owner can update category multiplier", async function () {
      await verifier.setCategoryMultiplier(0, 5);
      expect(await verifier.categoryMultiplier(0)).to.equal(5n);
    });

    it("owner can transfer ownership", async function () {
      await verifier.transferOwnership(alice.address);
      expect(await verifier.owner()).to.equal(alice.address);
    });

    it("cannot transfer ownership to zero address", async function () {
      await expect(verifier.transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWith("LuminaVerifier: zero address");
    });
  });
});
