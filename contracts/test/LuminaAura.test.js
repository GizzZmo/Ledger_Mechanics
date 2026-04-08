const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("LuminaAura", function () {
  let aura, ledger, verifier;
  let owner, alice, bob, attacker;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("LuminaVerifier");
    verifier = await Verifier.deploy();

    const Aura = await ethers.getContractFactory("LuminaAura");
    aura = await Aura.deploy();

    const Ledger = await ethers.getContractFactory("LuminaLedger");
    ledger = await Ledger.deploy(await verifier.getAddress(), await aura.getAddress());

    await aura.setLedger(await ledger.getAddress());
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("has correct name and symbol", async function () {
      expect(await aura.name()).to.equal("LuminaAura");
      expect(await aura.symbol()).to.equal("AURA");
    });

    it("sets deployer as owner", async function () {
      expect(await aura.owner()).to.equal(owner.address);
    });

    it("sets ledger correctly", async function () {
      expect(await aura.ledger()).to.equal(await ledger.getAddress());
    });
  });

  // ── Soulbound ──────────────────────────────────────────────────────────────

  describe("Soulbound (non-transferable)", function () {
    beforeEach(async function () {
      // Mint a token for alice via ledger
      const proof = ethers.keccak256(ethers.toUtf8Bytes("alice:energy:1"));
      await ledger.connect(alice).submitEntry(0, 100, proof, ethers.ZeroHash);
    });

    it("reverts on safeTransferFrom", async function () {
      const tokenId = await aura.auraOf(alice.address);
      await expect(
        aura.connect(alice)["safeTransferFrom(address,address,uint256)"](
          alice.address, bob.address, tokenId
        )
      ).to.be.revertedWithCustomError(aura, "Soulbound");
    });

    it("reverts on transferFrom", async function () {
      const tokenId = await aura.auraOf(alice.address);
      await expect(
        aura.connect(alice).transferFrom(alice.address, bob.address, tokenId)
      ).to.be.revertedWithCustomError(aura, "Soulbound");
    });

    it("reverts even when approved", async function () {
      const tokenId = await aura.auraOf(alice.address);
      await aura.connect(alice).approve(bob.address, tokenId);
      await expect(
        aura.connect(bob).transferFrom(alice.address, bob.address, tokenId)
      ).to.be.revertedWithCustomError(aura, "Soulbound");
    });
  });

  // ── mintOrUpdate ───────────────────────────────────────────────────────────

  describe("mintOrUpdate", function () {
    it("reverts if caller is not ledger", async function () {
      await expect(
        aura.connect(attacker).mintOrUpdate(alice.address, 100)
      ).to.be.revertedWithCustomError(aura, "NotLedger");
    });

    it("mints token with correct owner on first call (via ledger)", async function () {
      const proof = ethers.keccak256(ethers.toUtf8Bytes("mint-test"));
      await ledger.connect(alice).submitEntry(0, 50, proof, ethers.ZeroHash);

      const tokenId = await aura.auraOf(alice.address);
      expect(tokenId).to.be.greaterThan(0n);
      expect(await aura.ownerOf(tokenId)).to.equal(alice.address);
    });

    it("updates score without minting second token on subsequent call", async function () {
      const p1 = ethers.keccak256(ethers.toUtf8Bytes("p1"));
      const p2 = ethers.keccak256(ethers.toUtf8Bytes("p2"));
      await ledger.connect(alice).submitEntry(0, 50, p1, ethers.ZeroHash);
      const tokenId1 = await aura.auraOf(alice.address);

      await ledger.connect(alice).submitEntry(0, 50, p2, ethers.ZeroHash);
      const tokenId2 = await aura.auraOf(alice.address);

      expect(tokenId1).to.equal(tokenId2);
      expect(await aura.balanceOf(alice.address)).to.equal(1n);
    });

    it("emits AuraMinted on first submission", async function () {
      const proof = ethers.keccak256(ethers.toUtf8Bytes("emit-mint"));
      await expect(
        ledger.connect(alice).submitEntry(0, 50, proof, ethers.ZeroHash)
      ).to.emit(aura, "AuraMinted");
    });

    it("emits AuraScoreUpdated on subsequent submission", async function () {
      const p1 = ethers.keccak256(ethers.toUtf8Bytes("emit-upd-1"));
      const p2 = ethers.keccak256(ethers.toUtf8Bytes("emit-upd-2"));
      await ledger.connect(alice).submitEntry(0, 50, p1, ethers.ZeroHash);
      await expect(
        ledger.connect(alice).submitEntry(0, 50, p2, ethers.ZeroHash)
      ).to.emit(aura, "AuraScoreUpdated");
    });

    it("assigns separate token IDs for different users", async function () {
      const pA = ethers.keccak256(ethers.toUtf8Bytes("alice-entry"));
      const pB = ethers.keccak256(ethers.toUtf8Bytes("bob-entry"));
      await ledger.connect(alice).submitEntry(0, 50, pA, ethers.ZeroHash);
      await ledger.connect(bob).submitEntry(0, 50, pB, ethers.ZeroHash);

      const tA = await aura.auraOf(alice.address);
      const tB = await aura.auraOf(bob.address);
      expect(tA).to.not.equal(tB);
    });
  });

  // ── tokenURI ───────────────────────────────────────────────────────────────

  describe("tokenURI", function () {
    it("returns a base64-encoded data URI", async function () {
      const proof = ethers.keccak256(ethers.toUtf8Bytes("uri-test"));
      await ledger.connect(alice).submitEntry(0, 100, proof, ethers.ZeroHash);

      const tokenId = await aura.auraOf(alice.address);
      const uri     = await aura.tokenURI(tokenId);

      expect(uri).to.match(/^data:application\/json;base64,/);

      const json = JSON.parse(
        Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()
      );
      expect(json.name).to.match(/^LuminaAura #/);
      expect(json.attributes[0].trait_type).to.equal("Impact Score");
      expect(json.attributes[0].value).to.be.a("number");
    });

    it("reverts for non-existent token", async function () {
      await expect(aura.tokenURI(9999)).to.be.reverted;
    });
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  describe("Admin", function () {
    it("non-owner cannot call setLedger", async function () {
      await expect(
        aura.connect(attacker).setLedger(attacker.address)
      ).to.be.revertedWithCustomError(aura, "NotOwner");
    });

    it("owner can transfer ownership", async function () {
      await aura.transferOwnership(alice.address);
      expect(await aura.owner()).to.equal(alice.address);
    });

    it("cannot transfer ownership to zero address", async function () {
      await expect(aura.transferOwnership(ethers.ZeroAddress)).to.be.reverted;
    });
  });
});
