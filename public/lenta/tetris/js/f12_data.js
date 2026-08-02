/* AUTOMATIŠKAI SUGENERUOTA — NEKEISTI RANKA.
 * Šaltinis: ../../game.js + ../../floor12_merge.js
 * Perkurti: node tools/extract_f12.js
 *
 * Čia yra TIKROS F12 reikšmės. units.js iš jų stato ROSTER — todėl
 * bet koks F12 pakeitimas persineša perpaleidus generatorių, o ne
 * perrašinėjant skaičius ranka. */
(function (g) { g.F12 = {
  "_src": "game.js + floor12_merge.js",
  "units": {
    "skull": {
      "sheets": {
        "idle": {
          "src": "assets_tiny/Skull_Idle.png",
          "frames": 8
        },
        "run": {
          "src": "assets_tiny/Skull_Run.png",
          "frames": 6
        },
        "attack": {
          "src": "assets_tiny/Skull_Attack.png",
          "frames": 7
        },
        "guard": {
          "src": "assets_tiny/Skull_Guard.png",
          "frames": 7
        }
      },
      "fps": {
        "idle": 7,
        "run": 10,
        "attack": 12,
        "guard": 10
      },
      "frameW": 192,
      "hitDelay": 420
    },
    "hog_rider": {
      "sheets": {
        "idle": {
          "src": "pigronke.png",
          "frames": 8
        },
        "walk": {
          "src": "pigronkewalk.png",
          "frames": 8
        },
        "attack": {
          "src": "ronkepigattack.png",
          "frames": 8
        },
        "hurt": {
          "src": "dmgtake01.png",
          "frames": 8
        }
      },
      "fps": {
        "idle": 8,
        "walk": 11,
        "attack": 12,
        "hurt": 20
      },
      "hitDelay": 360
    },
    "ghost": {
      "sheets": {
        "idle": {
          "src": "assets_tiny/trees/Vaiduoklisindle.png",
          "frames": 12
        },
        "walk": {
          "src": "assets_tiny/trees/Vaiduoklis.png",
          "frames": 8
        },
        "attack": {
          "src": "assets_tiny/trees/VaiduoklisAttack.png",
          "frames": 12
        },
        "hurt": {
          "src": "assets_tiny/trees/VaiduoklisDmgTake.png",
          "frames": 8
        }
      },
      "fps": {
        "idle": 6,
        "walk": 6,
        "attack": 28,
        "hurt": 16
      },
      "fireT": 400
    },
    "shaman": {
      "anims": {
        "idle": {
          "path": "animations/shaman-idle",
          "frames": 8
        },
        "run": {
          "path": "animations/shaman-run",
          "frames": 4
        },
        "attack": {
          "path": "animations/shaman-attack",
          "frames": 10
        }
      },
      "fps": {
        "idle": 6,
        "run": 10,
        "attack": 14
      },
      "dirs": [
        "east",
        "west",
        "north",
        "south"
      ],
      "f12UsesDir": "east",
      "attackDur": 714.2857142857143,
      "fireT": 430
    },
    "archer": {
      "anims": {
        "idle": {
          "frames": 6,
          "ms": 125,
          "src": "assets_tiny/Archer_Idle.png"
        },
        "run": {
          "frames": 4,
          "ms": 110,
          "src": "assets_tiny/Archer_Run.png"
        },
        "shoot": {
          "frames": 8,
          "ms": 100,
          "src": "assets_tiny/Archer_Shoot.png"
        },
        "impact": {
          "frames": 9,
          "ms": 60,
          "src": "assets_tiny/Arrow_Impact.png"
        }
      },
      "frameW": 192,
      "shootDur": 800,
      "fireT": 400
    },
    "harpoon_fish": {
      "anims": {
        "idle": {
          "frames": 8,
          "ms": 120,
          "src": "assets_tiny/HarpoonFish_Idle.png"
        },
        "run": {
          "frames": 6,
          "ms": 110,
          "src": "assets_tiny/HarpoonFish_Run.png"
        },
        "throw": {
          "frames": 8,
          "ms": 90,
          "src": "assets_tiny/HarpoonFish_Throw.png"
        }
      },
      "frameW": 192,
      "throwDur": 720,
      "fireT": 450
    },
    "ronhood": {
      "sheets": {
        "idle": {
          "src": "ronhood_idle.png",
          "frames": 8
        },
        "walk": {
          "src": "ronhood_walk.png",
          "frames": 8
        },
        "attack": {
          "src": "ronhood_attack.png",
          "frames": 8
        }
      },
      "fps": {
        "idle": 8,
        "walk": 10
      },
      "shootDur": 580,
      "fireT": 400
    }
  },
  "proj": {
    "arrow": {
      "dur": 250,
      "impactDur": 540,
      "critMul": 2,
      "drawScale": 0.85,
      "impactScale": 1.4,
      "arcScale": 0.6
    },
    "harpoon": {
      "dur": 280,
      "drawScale": 0.85
    },
    "shaman": {
      "dur": 380,
      "explDur": 495,
      "sheet": "assets_tiny/Shaman_Projectile.png",
      "frames": 3,
      "ms": 90,
      "explSheet": "assets_tiny/Shaman_Explosion.png",
      "explFrames": 9,
      "explMs": 55,
      "drawScale": 0.95,
      "explScale": 1.6
    },
    "ghost": {
      "dur": 360,
      "procedural": true,
      "weaveMs": 90,
      "grad": [
        "rgba(255,252,200,0.95)",
        "rgba(255,220,70,0.65)",
        "rgba(230,185,30,0)"
      ],
      "radiusScale": 0.2
    }
  },
  "behavior": {
    "swingHold": 880,
    "ally": {
      "thinkMin": 2000,
      "thinkRnd": 3000,
      "guardChance": 0.1,
      "idleChance": 0.18,
      "idleMin": 1000,
      "idleRnd": 1200
    },
    "ghostPause": {
      "min": 1600,
      "rnd": 2200,
      "chance": 0.5,
      "idleMin": 650,
      "idleRnd": 750
    },
    "hitFlashMs": 200,
    "alliesNeverFlip": true
  },
  "stats": {
    "skull": {
      "hp": 8,
      "dmg": 2,
      "speed": 0.012,
      "attackCooldown": 1500,
      "range": 0.04
    },
    "archer": {
      "hp": 5,
      "dmg": 3,
      "speed": 0.014,
      "attackCooldown": 2500,
      "range": 0.12
    },
    "shaman": {
      "hp": 5,
      "dmg": 4,
      "speed": 0.01,
      "attackCooldown": 3000,
      "range": 0.14
    },
    "harpoon_fish": {
      "hp": 7,
      "dmg": 3,
      "speed": 0.011,
      "attackCooldown": 1800,
      "range": 0.1
    },
    "hog_rider": {
      "hp": 14,
      "dmg": 8,
      "speed": 0.013,
      "attackCooldown": 2800,
      "range": 0.05
    },
    "ghost": {
      "hp": 4,
      "dmg": 4,
      "speed": 0.011,
      "attackCooldown": 3000,
      "range": 0.16
    },
    "ronhood": {
      "hp": 7,
      "dmg": 3,
      "speed": 0.014,
      "attackCooldown": 2250,
      "range": 0.1
    },
    "_ninja": {
      "hp": 10,
      "dmg": 1,
      "speed": 0.024,
      "attackCooldown": 1650,
      "range": 0.04
    },
    "tower": {
      "hp": 30,
      "dmg": 4,
      "speed": 0,
      "attackCooldown": 1400,
      "range": 0.55,
      "static": true
    },
    "crossbow_tower": {
      "hp": 35,
      "dmg": 6,
      "speed": 0,
      "attackCooldown": 1900,
      "range": 0.75,
      "static": true
    },
    "zip": {
      "hp": 25,
      "dmg": 8,
      "speed": 0,
      "attackCooldown": 2800,
      "range": 0.45,
      "static": true
    }
  },
  "special": {
    "skull": {
      "rangeKind": "MELEE",
      "crit": 0,
      "block": 0.25,
      "aoe": false
    },
    "archer": {
      "rangeKind": "LONG",
      "crit": 0,
      "block": 0,
      "aoe": false
    },
    "shaman": {
      "rangeKind": "LONG",
      "crit": 0,
      "block": 0,
      "aoe": true
    },
    "harpoon_fish": {
      "rangeKind": "MID",
      "crit": 0,
      "block": 0,
      "aoe": false
    },
    "hog_rider": {
      "rangeKind": "MELEE",
      "crit": 0.1,
      "block": 0,
      "aoe": false
    },
    "ghost": {
      "rangeKind": "LONG",
      "crit": 0,
      "block": 0,
      "aoe": false
    },
    "ronhood": {
      "rangeKind": "MID",
      "crit": 0.01,
      "block": 0,
      "aoe": false
    }
  },
  "miss": {
    "archer": 0.15,
    "harpoon_fish": 0.05,
    "shaman": 0.05,
    "skull": 0.1,
    "hog_rider": 0.05,
    "ghost": 0.05,
    "ronhood": 0.11
  },
  "meleeRange": 0.04,
  "draw": {
    "base": 4.5,
    "ghostMul": 0.66,
    "hogH": 5.6,
    "ronhoodContentH": 2.4,
    "szOfLane": 0.5,
    "unitOfLane": 2.25
  }
}; })(typeof window !== 'undefined' ? window : globalThis);
