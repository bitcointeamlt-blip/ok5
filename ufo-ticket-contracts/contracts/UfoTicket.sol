// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * UFO Ticket (SBT) with RONKE escrow.
 *
 * Rules:
 * - Mint costs 200 RONKE and creates a NON-TRANSFERABLE ticket (SBT).
 * - One active ticket per wallet.
 * - Ticket stores snapshot of player stats at mint time.
 * - On match resolve: loser ticket is destroyed (burned) and winner gets 100 RONKE.
 *
 * IMPORTANT:
 * - `resolveMatch` is `onlyOwner` (intended: server signer / matchmaker).
 * - Consider adding EIP-712 signed payload for stats if you want on-chain verification of snapshot source.
 */
contract UfoTicket is ERC721, Ownable, ReentrancyGuard {
  struct Stats {
    uint16 maxHP;
    uint16 maxArmor;
    uint16 dmg;
    uint8 critChance;
    uint8 accuracy;
  }

  event TicketMinted(address indexed owner, uint256 indexed tokenId);
  event TicketDestroyed(uint256 indexed tokenId, address indexed loser, address indexed winner, uint256 payoutRonke);

  IERC20 public immutable ronke;
  uint256 public constant MINT_COST = 200e18; // assumes RONKE has 18 decimals
  uint256 public constant WIN_REWARD = 100e18;

  uint256 private _nextId = 1;
  mapping(uint256 => Stats) public statsOf;
  mapping(uint256 => bool) public isDestroyed;
  mapping(address => uint256) public activeTokenIdOf; // 0 => none

  constructor(address ronkeToken) ERC721("PewPew UFO Ticket", "UFO") Ownable(msg.sender) {
    require(ronkeToken != address(0), "ronke=0");
    ronke = IERC20(ronkeToken);
  }

  function mint(Stats calldata s) external nonReentrant returns (uint256 tokenId) {
    require(activeTokenIdOf[msg.sender] == 0, "already active");
    // escrow deposit
    require(ronke.transferFrom(msg.sender, address(this), MINT_COST), "ronke transferFrom failed");

    tokenId = _nextId++;
    statsOf[tokenId] = s;
    activeTokenIdOf[msg.sender] = tokenId;
    _safeMint(msg.sender, tokenId);

    emit TicketMinted(msg.sender, tokenId);
  }

  /**
   * Server/matchmaker resolves match:
   * - burn loser ticket
   * - payout winner 100 RONKE from escrow
   */
  function resolveMatch(uint256 loserTokenId, address winner) external onlyOwner nonReentrant {
    require(winner != address(0), "winner=0");
    require(!isDestroyed[loserTokenId], "already destroyed");

    address loser = ownerOf(loserTokenId);
    isDestroyed[loserTokenId] = true;
    activeTokenIdOf[loser] = 0;

    _burn(loserTokenId);
    require(ronke.transfer(winner, WIN_REWARD), "ronke payout failed");

    emit TicketDestroyed(loserTokenId, loser, winner, WIN_REWARD);
  }

  // --- SBT: make token non-transferable ---
  function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
    from = super._update(to, tokenId, auth);
    // allow mint (from=0) and burn (to=0) only
    require(from == address(0) || to == address(0), "SBT: non-transferable");
  }
}


