export interface Player {
  dotCurrency: number;
  dmg: number;
}

export interface DOT {
  maxHP: number;
  hp: number;
  maxArmor: number;
  armor: number;
  reward: number;
  scaler: {
    hp: number;
    armor: number;
  };
}

export interface Costs {
  click: number;
  upgradeBase: number;
  upgradeGrowth: number;
}

export interface Upgrade {
  successChance: number;
  level: number;
}

export interface Timers {
  sinceDamage: number;
  armorRegenEvery: number;
  death: number;
}

export interface Flags {
  state: 'Alive' | 'Dying' | 'Respawn';
  mute: boolean;
}

export interface GameState {
  player: Player;
  dot: DOT;
  costs: Costs;
  upgrade: Upgrade;
  timers: Timers;
  flags: Flags;
  saveVersion: number;
}

export const createInitialGameState = (): GameState => ({
  player: {
    dotCurrency: 1000, // Pradinis balansas 1000 Dot
    dmg: 1
  },
  dot: {
    maxHP: 10,
    hp: 10,
    maxArmor: 5,
    armor: 5,
    reward: 12, // floor(10 × (1 + 0.5×0.5)) = 12
    scaler: {
      hp: 1.25,
      armor: 1.2
    }
  },
  costs: {
    click: 1,
    upgradeBase: 10,
    upgradeGrowth: 1.15
  },
  upgrade: {
    successChance: 0.4,
    level: 0
  },
  timers: {
    sinceDamage: 0,
    armorRegenEvery: 2.0,
    death: 0
  },
  flags: {
    state: 'Alive',
    mute: false
  },
  saveVersion: 1
});

export const calculateReward = (maxHP: number, maxArmor: number): number => {
  return Math.floor(maxHP * (1 + (maxArmor / maxHP) * 0.5));
};

export const calculateUpgradeCost = (level: number, baseCost: number, growth: number): number => {
  return Math.ceil(baseCost * Math.pow(growth, level));
};
