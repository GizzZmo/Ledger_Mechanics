// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./LuminaVerifier.sol";
import "./LuminaAura.sol";

/// @title LuminaLedger — Core ledger contract for impact entry submission
contract LuminaLedger {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    enum Category {
        Energy,   // 0 – kWh saved
        Capital,  // 1 – USD redirected
        Behavior  // 2 – behavioural change score
    }

    struct LuminaEntry {
        uint256 timestamp;
        address user;
        uint8   category;      // 0=energy, 1=capital, 2=behavior
        uint256 quantity;      // kWh saved | USD redirected | behaviour units
        bytes32 proofHash;     // keccak256 hash of raw evidence
        uint256 impactScore;
        bytes32 merkleRoot;    // batch-privacy Merkle root
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    LuminaVerifier public immutable verifier;
    LuminaAura     public immutable aura;

    uint256 public entryCount;
    mapping(uint256 => LuminaEntry) public entries;
    /// @dev per-user cumulative impact score
    mapping(address => uint256) public userScore;
    /// @dev tracks proof hashes to prevent double-submission
    mapping(bytes32 => bool) public usedProofs;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event EntrySubmitted(
        uint256 indexed entryId,
        address indexed user,
        uint8   category,
        uint256 quantity,
        uint256 impactScore,
        bytes32 proofHash
    );

    event ScoreUpdated(address indexed user, uint256 newCumulativeScore);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroQuantity();
    error DuplicateProof();
    error InvalidCategory();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address verifier_, address aura_) {
        verifier = LuminaVerifier(verifier_);
        aura     = LuminaAura(aura_);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // External functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Submit a new impact entry.
    /// @param category_   0=energy, 1=capital, 2=behavior
    /// @param quantity_   Measured quantity (kWh, USD cents, units)
    /// @param proofHash_  keccak256 of off-chain evidence
    /// @param merkleRoot_ Merkle root of the private batch (use bytes32(0) for single)
    /// @return entryId    Storage index of the new entry
    function submitEntry(
        uint8   category_,
        uint256 quantity_,
        bytes32 proofHash_,
        bytes32 merkleRoot_
    ) external returns (uint256 entryId) {
        if (quantity_ == 0)      revert ZeroQuantity();
        if (category_ > 2)       revert InvalidCategory();
        if (usedProofs[proofHash_]) revert DuplicateProof();

        usedProofs[proofHash_] = true;

        uint256 score = verifier.computeImpactScore(category_, quantity_);

        LuminaEntry memory entry = LuminaEntry({
            timestamp:   block.timestamp,
            user:        msg.sender,
            category:    category_,
            quantity:    quantity_,
            proofHash:   proofHash_,
            impactScore: score,
            merkleRoot:  merkleRoot_
        });

        entryId = entryCount;
        entries[entryId] = entry;
        unchecked { ++entryCount; }

        userScore[msg.sender] += score;

        // Mint or update soulbound Aura NFT
        aura.mintOrUpdate(msg.sender, userScore[msg.sender]);

        emit EntrySubmitted(entryId, msg.sender, category_, quantity_, score, proofHash_);
        emit ScoreUpdated(msg.sender, userScore[msg.sender]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Retrieve a stored entry by id.
    function getEntry(uint256 entryId) external view returns (LuminaEntry memory) {
        return entries[entryId];
    }

    /// @notice Return all entries submitted by a specific user (gas-heavy; use off-chain indexing).
    function getEntriesByUser(address user) external view returns (LuminaEntry[] memory result) {
        uint256 count;
        for (uint256 i; i < entryCount; ) {
            if (entries[i].user == user) ++count;
            unchecked { ++i; }
        }
        result = new LuminaEntry[](count);
        uint256 idx;
        for (uint256 i; i < entryCount; ) {
            if (entries[i].user == user) {
                result[idx] = entries[i];
                unchecked { ++idx; }
            }
            unchecked { ++i; }
        }
    }
}
