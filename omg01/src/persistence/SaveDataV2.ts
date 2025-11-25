// Save Data V2 Interface
export interface SaveDataV2 {
  version: number; // Save version (2)
  profile: {
    id?: string; // Optional profile ID for cloud sync
    name?: string; // Optional profile name
    createdAt: number; // Timestamp when profile was created
    lastPlayed: number; // Timestamp of last play session
  };
  solo: {
    currency: number; // dotCurrency
    dmg: number; // Base damage
    level: number; // currentLevel
    maxUnlockedLevel: number; // maxUnlockedLevel
    killsInCurrentLevel: number; // killsInCurrentLevel
    upgrades: {
      critChance: number; // critChance
      critUpgradeLevel: number; // critUpgradeLevel
      accuracy: number; // accuracy
      accuracyUpgradeLevel: number; // accuracyUpgradeLevel
    };
    maxHP: number; // dotMaxHP
    maxArmor: number; // dotMaxArmor
  };
  settings: {
    mute?: boolean; // Audio mute setting
    // Add other settings as needed
  };
}

// Migration from V1 (if exists)
export interface SaveDataV1 {
  saveVersion?: number;
  player?: {
    dotCurrency?: number;
    dmg?: number;
  };
  dot?: {
    maxHP?: number;
    maxArmor?: number;
  };
  upgrade?: {
    level?: number;
  };
  timestamp?: number;
}

// Helper function to migrate V1 to V2
export function migrateV1ToV2(v1Data: SaveDataV1): SaveDataV2 {
  const now = Date.now();
  return {
    version: 2,
    profile: {
      createdAt: v1Data.timestamp || now,
      lastPlayed: now,
    },
    solo: {
      currency: v1Data.player?.dotCurrency || 1000,
      dmg: v1Data.player?.dmg || 1,
      level: 1, // Default, V1 didn't have levels
      maxUnlockedLevel: 1,
      killsInCurrentLevel: 0,
      upgrades: {
        critChance: 4, // Default
        critUpgradeLevel: 0,
        accuracy: 60, // Default
        accuracyUpgradeLevel: 0,
      },
      maxHP: v1Data.dot?.maxHP || 10,
      maxArmor: v1Data.dot?.maxArmor || 5,
    },
    settings: {
      mute: false,
    },
  };
}

// Create initial V2 save data
export function createInitialSaveDataV2(): SaveDataV2 {
  const now = Date.now();
  return {
    version: 2,
    profile: {
      createdAt: now,
      lastPlayed: now,
    },
    solo: {
      currency: 1000,
      dmg: 1,
      level: 1,
      maxUnlockedLevel: 1,
      killsInCurrentLevel: 0,
      upgrades: {
        critChance: 4,
        critUpgradeLevel: 0,
        accuracy: 60,
        accuracyUpgradeLevel: 0,
      },
      maxHP: 10,
      maxArmor: 5,
    },
    settings: {
      mute: false,
    },
  };
}


