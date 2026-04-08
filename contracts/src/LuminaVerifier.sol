// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LuminaVerifier — Impact score computation and challenge logic
contract LuminaVerifier {
    // ─────────────────────────────────────────────────────────────────────────
    // Constants / configuration
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Fixed-point scale: scores are stored as integers ×1e6 to preserve precision
    uint256 public constant SCALE = 1e6;

    /// @dev Global baseline (denominator for normalisation, in quantity units ×SCALE)
    uint256 public baseline = 100 * SCALE;   // 100 kWh-equivalent baseline

    /// @dev Category multipliers: energy=2, capital=1 (×0.5 coeff), behavior=3
    uint256[3] public categoryMultiplier = [uint256(2), uint256(1), uint256(3)];

    /// @dev Capital category coefficient is 0.5 → applied as ÷2 in maths
    uint8 public constant CAPITAL_CATEGORY = 1;

    /// @dev Default verifier count used when no on-chain challengers exist
    uint256 public defaultVerifierCount = 1;

    // ─────────────────────────────────────────────────────────────────────────
    // Challenge state
    // ─────────────────────────────────────────────────────────────────────────

    struct Challenge {
        address challenger;
        uint256 entryId;
        string  reason;
        bool    resolved;
        bool    upheld;       // true = challenge was upheld (entry invalidated)
    }

    uint256 public challengeCount;
    mapping(uint256 => Challenge) public challenges;

    /// @dev entryId → number of successful verifiers that confirmed the entry
    mapping(uint256 => uint256) public verifierCount;

    // ─────────────────────────────────────────────────────────────────────────
    // Access
    // ─────────────────────────────────────────────────────────────────────────

    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "LuminaVerifier: not owner");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event EntryVerified(uint256 indexed entryId, address indexed verifierAddr, uint256 newCount);
    event ChallengeSubmitted(uint256 indexed challengeId, uint256 indexed entryId, address challenger);
    event ChallengeResolved(uint256 indexed challengeId, bool upheld);
    event BaselineUpdated(uint256 newBaseline);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: impact score
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Compute an impact score for a submitted entry.
    ///
    ///   ImpactScore = (delta × coeff / baseline) × multiplier × verifierCount
    ///
    ///   where coeff = 0.5 for Capital, 1.0 for Energy/Behavior
    ///
    /// @param category  0=energy, 1=capital, 2=behavior
    /// @param quantity  Measured delta (kWh, USD cents, behaviour units)
    /// @param entryId_  Storage id — used to look up on-chain verifier count (0 = new entry)
    /// @return score    Integer result ×SCALE
    function computeImpactScore(
        uint8   category,
        uint256 quantity,
        uint256 entryId_
    ) external view returns (uint256 score) {
        require(category <= 2, "LuminaVerifier: bad category");

        uint256 delta = quantity * SCALE; // upscale

        // Apply 0.5 coefficient for Capital
        if (category == CAPITAL_CATEGORY) {
            delta = delta / 2;
        }

        uint256 multiplier = categoryMultiplier[category];
        uint256 vcnt = verifierCount[entryId_] + defaultVerifierCount;

        // score = (delta / baseline) × multiplier × vcnt
        score = (delta * multiplier * vcnt) / baseline;
    }

    /// @notice Overload used by LuminaLedger before an entryId exists (always uses defaultVerifierCount).
    function computeImpactScore(
        uint8   category,
        uint256 quantity
    ) external view returns (uint256 score) {
        require(category <= 2, "LuminaVerifier: bad category");

        uint256 delta = quantity * SCALE;
        if (category == CAPITAL_CATEGORY) {
            delta = delta / 2;
        }

        uint256 multiplier = categoryMultiplier[category];
        score = (delta * multiplier * defaultVerifierCount) / baseline;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Verification
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Signal that caller has verified the evidence for an entry.
    function verifyEntry(uint256 entryId) external {
        unchecked { ++verifierCount[entryId]; }
        emit EntryVerified(entryId, msg.sender, verifierCount[entryId]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Challenges
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Raise a challenge against a submitted entry.
    function challengeEntry(uint256 entryId, string calldata reason) external returns (uint256 challengeId) {
        challengeId = challengeCount;
        challenges[challengeId] = Challenge({
            challenger: msg.sender,
            entryId:    entryId,
            reason:     reason,
            resolved:   false,
            upheld:     false
        });
        unchecked { ++challengeCount; }
        emit ChallengeSubmitted(challengeId, entryId, msg.sender);
    }

    /// @notice Resolve a challenge (owner/DAO only for now).
    /// @param upheld_ true if the challenge is upheld (entry is deemed invalid)
    function resolveChallenge(uint256 challengeId, bool upheld_) external onlyOwner {
        Challenge storage c = challenges[challengeId];
        require(!c.resolved, "LuminaVerifier: already resolved");
        c.resolved = true;
        c.upheld   = upheld_;
        emit ChallengeResolved(challengeId, upheld_);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setBaseline(uint256 newBaseline) external onlyOwner {
        require(newBaseline > 0, "LuminaVerifier: zero baseline");
        baseline = newBaseline;
        emit BaselineUpdated(newBaseline);
    }

    function setCategoryMultiplier(uint8 category, uint256 mult) external onlyOwner {
        require(category <= 2, "LuminaVerifier: bad category");
        categoryMultiplier[category] = mult;
    }

    function setDefaultVerifierCount(uint256 count) external onlyOwner {
        require(count > 0, "LuminaVerifier: zero count");
        defaultVerifierCount = count;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "LuminaVerifier: zero address");
        owner = newOwner;
    }
}
