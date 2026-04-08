// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/// @title LuminaAura — Soulbound reputation NFT
/// @dev One token per address; non-transferable; score embedded in on-chain SVG metadata.
contract LuminaAura is ERC721 {
    using Strings for uint256;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public ledger;        // only LuminaLedger may call mintOrUpdate
    address public owner;         // admin for ledger pointer updates

    uint256 private _nextTokenId; // monotonically increasing

    /// @dev address → tokenId (0 = no token; valid tokens start at 1)
    mapping(address => uint256) public auraOf;
    /// @dev tokenId → cumulative impact score
    mapping(uint256 => uint256) public scoreOf;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event AuraMinted(address indexed user, uint256 indexed tokenId);
    event AuraScoreUpdated(address indexed user, uint256 indexed tokenId, uint256 newScore);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error Soulbound();
    error NotLedger();
    error NotOwner();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() ERC721("LuminaAura", "AURA") {
        owner = msg.sender;
        // token IDs start at 1
        _nextTokenId = 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Soulbound enforcement — block ALL transfers
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Override to make tokens non-transferable after minting.
    ///      We allow transfer FROM address(0) (mint) only.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Revert on any transfer that isn't a mint
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mint / update (called by LuminaLedger)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Mint a new Aura NFT for `user`, or update their existing score.
    /// @param user      Recipient address
    /// @param newScore  New cumulative impact score
    function mintOrUpdate(address user, uint256 newScore) external {
        if (msg.sender != ledger) revert NotLedger();

        uint256 tokenId = auraOf[user];
        if (tokenId == 0) {
            // First entry — mint
            tokenId = _nextTokenId;
            unchecked { ++_nextTokenId; }
            auraOf[user]     = tokenId;
            scoreOf[tokenId] = newScore;
            _safeMint(user, tokenId);
            emit AuraMinted(user, tokenId);
        } else {
            // Subsequent entry — update score only
            scoreOf[tokenId] = newScore;
            emit AuraScoreUpdated(user, tokenId, newScore);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Token URI — fully on-chain SVG
    // ─────────────────────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        address holder = ownerOf(tokenId);
        uint256 score  = scoreOf[tokenId];

        string memory svg = _buildSVG(holder, score, tokenId);
        string memory json = string(abi.encodePacked(
            '{"name":"LuminaAura #', tokenId.toString(), '",',
            '"description":"A soulbound Lumina impact reputation token.",',
            '"attributes":[{"trait_type":"Impact Score","value":', score.toString(), '}],',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set the authorised LuminaLedger address.
    function setLedger(address ledger_) external {
        if (msg.sender != owner) revert NotOwner();
        ledger = ledger_;
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        require(newOwner != address(0));
        owner = newOwner;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _buildSVG(
        address holder,
        uint256 score,
        uint256 tokenId
    ) internal pure returns (string memory) {
        string memory addrStr = _toShortAddr(holder);
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">',
            '<defs><radialGradient id="bg" cx="50%" cy="50%" r="70%">',
            '<stop offset="0%" style="stop-color:#1a0a3c"/>',
            '<stop offset="100%" style="stop-color:#0d0520"/></radialGradient></defs>',
            '<rect width="300" height="300" fill="url(#bg)" rx="18"/>',
            '<circle cx="150" cy="110" r="55" fill="none" stroke="#a78bfa" stroke-width="2.5" opacity="0.7"/>',
            '<text x="150" y="117" font-family="monospace" font-size="26" fill="#e9d5ff" text-anchor="middle" font-weight="bold">',
            unicode'✦ AURA',
            '</text>',
            '<text x="150" y="170" font-family="monospace" font-size="13" fill="#c4b5fd" text-anchor="middle">',
            'Score: ', score.toString(),
            '</text>',
            '<text x="150" y="195" font-family="monospace" font-size="9" fill="#7c3aed" text-anchor="middle">',
            addrStr,
            '</text>',
            '<text x="150" y="270" font-family="monospace" font-size="9" fill="#4c1d95" text-anchor="middle">',
            'Token #', tokenId.toString(), ' | LuminaLedger',
            '</text>',
            '</svg>'
        ));
    }

    /// @dev Returns a shortened 0xAAAA…BBBB representation.
    function _toShortAddr(address addr) internal pure returns (string memory) {
        bytes memory b = abi.encodePacked(addr);
        bytes memory hex_ = new bytes(42);
        hex_[0] = "0";
        hex_[1] = "x";
        bytes memory alphabet = "0123456789abcdef";
        for (uint256 i; i < 20; ) {
            hex_[2 + i * 2]     = alphabet[uint8(b[i] >> 4)];
            hex_[2 + i * 2 + 1] = alphabet[uint8(b[i] & 0x0f)];
            unchecked { ++i; }
        }
        // Return first 6 + "…" + last 4 chars
        bytes memory short = new bytes(13);
        for (uint256 i; i < 6; ) { short[i] = hex_[i]; unchecked { ++i; } }
        short[6]  = 0xe2; short[7]  = 0x80; short[8]  = 0xa6; // UTF-8 ellipsis
        short[9]  = hex_[38];
        short[10] = hex_[39];
        short[11] = hex_[40];
        short[12] = hex_[41];
        return string(short);
    }
}
