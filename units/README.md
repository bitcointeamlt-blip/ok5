# TIMELOCK MAINFRAME

> Cyber-Grid Tactical Roguelite — browser-based, zero dependencies

**Live:** https://0x-pewpew.com/units/

---

## What is it

TIMELOCK MAINFRAME is a turn-based tactical game played on a grid. Time moves only when you act — bullets fly, enemies move, and damage resolves only after your input. Three modes: solo dungeon crawl, 1v1 vs CPU, or 2-player local PvP.

---

## Game Modes

### MAINFRAME (Adventure)
Solo roguelite dungeon crawler. Navigate procedurally generated dungeons, fight enemies, collect loot, and push deeper into the mainframe. Energy is your lifeline — every action costs it. Reach the exit portal to advance to the next floor.

- Fog of war — enemies only visible in your line of sight
- 5 enemy types with different HP and behavior
- Shrines, armories, chests, and loot drops
- Adaptive music that intensifies when enemies are near

### 1 PLAYER (PvE)
Your 3-unit squad vs a CPU-controlled enemy team on a 20×12 grid. Chess-clock timer — if you run out of time, you lose.

### 2 PLAYERS (PvP)
Local multiplayer — two players share a keyboard. P1 uses WASD + Space, P2 uses Arrow keys + Enter.

---

## Controls

### Player 1 (Adventure + PvP)
| Key | Action |
|-----|--------|
| `W A S D` | Move selected unit |
| `SPACE` or `Left Click` | Shoot / confirm action |
| `Q` | Cycle through weapons |
| `Click unit` | Select unit |
| `Mouse` | Aim direction |

### Player 2 (PvP only)
| Key | Action |
|-----|--------|
| `↑ ↓ ← →` | Move selected unit |
| `ENTER` | Shoot |
| `U / I / O` | Select unit 1 / 2 / 3 |
| `P` | Cycle weapons |

---

## Weapons

| Weapon | Notes |
|--------|-------|
| **GUN** | Default. Infinite ammo. Single bullet per tick. |
| **LASER** | Charges for 2 ticks before firing. Penetrates walls of enemies in a line. |
| **CANNON** | Heavy slug. Slow but pierces one unit. |
| **SHOTGUN** | 3 pellets spread. Short effective range (~6 cells). |
| **KNIFE** | Melee. Auto-activates when adjacent to enemy. |

Ammo regenerates automatically over ticks. Switching weapons requires pressing `Q` when not adjacent to an enemy.

---

## How Time Works

The game is **tick-based** — nothing moves until a player acts.

1. You queue an action (move, shoot, wait)
2. All entities resolve simultaneously
3. Bullets travel, enemies react, damage applies
4. Clock freezes again

In **Adventure mode** the clock is always your turn — enemies respond after every action you take.

---

## Adventure Mode — Energy System

Energy replaces HP for the hero. Every action consumes 1 energy. Taking damage from enemies drains additional energy. Reaching 0 energy ends the run.

**Energy sources:**
- Chests: `+5`
- Shrines: `+35`
- Loot drops: `+5–21` random
- Exit portal: `+10`

---

## Enemy Types

| Name | HP | Notes |
|------|----|-------|
| Scout | 1 | Fast, low HP |
| Grunt | 2 | Balanced |
| Heavy | 3 | Tanky |
| Elite | 2 | Higher damage |
| Worm | 2 | Melee only, moves in segments |

Enemies adjacent to the hero deal automatic melee damage each tick.

---

## Tech Stack

- Vanilla JavaScript — no frameworks, no build step
- HTML5 Canvas for all rendering
- Web Audio API — procedurally synthesized music and SFX (no audio files)
- Pixel art sprites via PixelLab API
- Fog of war via raytrace reveal system
- Procedural dungeon generation (room-based with spanning tree connectivity)

---

## File Structure

```
lenta/
├── index.html          # Game shell + HUD markup
├── game.js             # All game logic (~3500 lines)
├── style.css           # UI styling
├── assets/
│   ├── hero.png        # Hero sprite (static fallback)
│   └── enemy_bug.png   # Enemy sprite
├── animations/
│   ├── breathing-idle/ # Hero idle animation frames (4 dirs × 4 frames)
│   ├── walking/        # Hero walk animation frames (4 dirs × 6 frames)
│   └── fight-stance-idle-8-frames/  # Hero fight frames
└── metadata.json       # Sprite metadata
```

---

## Running Locally

No server required for basic play. Open `index.html` directly in a browser.

> **Note:** Sprite animations load from relative paths (`animations/`). For full animation support, serve via a local HTTP server:
> ```bash
> npx serve .
> # or
> python -m http.server 8080
> ```
> Then open `http://localhost:8080`

---

## Music

Two original game tracks synthesized in real-time using Web Audio API:

- **Track 1 — The Grid:** Dark industrial techno, sawtooth bass, punchy kick and snare
- **Track 2 — Shadow Dungeon:** Slow atmospheric dungeon RPG theme, triangle lead, tribal percussion

Music intensity adapts dynamically based on proximity to enemies and remaining energy. No audio files are loaded — everything is generated from oscillators.

---

## Known Limitations

- Adventure mode AI is probabilistic (no pathfinding beyond worm type)
- Coins collected have no current in-game use
- No save system — runs reset on page reload
- 2-player mode requires keyboard sharing (no gamepad support)
