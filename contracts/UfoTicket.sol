// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * UFO Ticket (SBT) — reference implementation sketch.
 *
 * Intended gameplay rules:
 * - Mint costs 200 RONKE deposited into this contract (escrow).
 * - Token is NON-TRANSFERABLE (soulbound).
 * - Token stores snapshot of player stats at mint time.
 * - PvP Online requires an ACTIVE (non-destroyed) ticket.
 * - On match resolution: loser ticket is destroyed, winner receives 100 RONKE from escrow.
 *
 * NOTE: This repo does not compile/deploy Solidity. This file is a spec + starting point.
 * We recommend implementing using OpenZeppelin ERC721 + Ownable/ReentrancyGuard.
 */

interface IERC20 {
  function transfer(address to, uint256 amount) external returns (bool);
  function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract UfoTicket /* is ERC721 */ {
  struct Stats {
    uint16 maxHP;
    uint16 maxArmor;
    uint16 dmg;
    uint8 critChance;
    uint8 accuracy;
    uint16 maxFuel; // example: jetpack fuel capacity snapshot
    // extend as needed (levels, upgrades, etc.)
  }

  address public immutable ronke;
  uint256 public constant MINT_COST = 200e18; // assumes 18 decimals
  uint256 public constant WIN_REWARD = 100e18;
  uint256 public constant LOSS_FEE = MINT_COST - WIN_REWARD;

  // Where the remaining 100 RONKE goes when a loser ticket is destroyed.
  address public feeRecipient;

  uint256 private _nextId = 1;
  mapping(uint256 => Stats) public statsOf;
  mapping(uint256 => bool) public isDestroyed;
  mapping(address => uint256) public activeTokenIdOf; // 0 = none

  constructor(address ronkeToken, address feeRecipient_) {
    ronke = ronkeToken;
    feeRecipient = feeRecipient_;
  }

  // Mint with snapshot stats. In production, enforce "one active token per wallet".
  function mint(Stats calldata s) external returns (uint256 tokenId) {
    require(activeTokenIdOf[msg.sender] == 0, "already has active ticket");
    require(IERC20(ronke).transferFrom(msg.sender, address(this), MINT_COST), "ronke transferFrom failed");
    tokenId = _nextId++;
    // _safeMint(msg.sender, tokenId);
    statsOf[tokenId] = s;
    activeTokenIdOf[msg.sender] = tokenId;
  }

  // Non-transferable: override transfer/approve to revert in ERC721 implementation.
  // function _beforeTokenTransfer(...) internal override { require(from==address(0) || to==address(0), "SBT"); }

  // Called by PvP authority (server / match contract). Burn loser and reward winner.
  function resolveMatch(uint256 loserTokenId, address winner) external /* onlyOwner / onlyMatchmaker */ {
    require(!isDestroyed[loserTokenId], "already destroyed");
    // address loser = ownerOf(loserTokenId);
    address loser = address(0); // placeholder until ERC721 is wired
    isDestroyed[loserTokenId] = true;
    activeTokenIdOf[loser] = 0;
    // _burn(loserTokenId);
    require(IERC20(ronke).transfer(winner, WIN_REWARD), "ronke payout failed");
    require(IERC20(ronke).transfer(feeRecipient, LOSS_FEE), "fee payout failed");
  }
}



