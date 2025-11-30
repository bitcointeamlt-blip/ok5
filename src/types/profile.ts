export type PlayerProfile = {
  nickname: string;
  xp: number;
  winsPvP: number;
  lossesPvP: number;
  dotBalance: number;
  
  // bendri stat'ai
  totalSoloKills: number;   // sunaikinti taškai solo
  totalUpgradeAttempts: number;
  totalUpgradeSuccesses: number; // sėkmingi upgrade'ai
  totalUpgradeFailures: number; // nepavykę upgrade'ai
  upgradeSuccessChance: number; // upgrade sėkmės šansas procentais (pradžioje 40%)
  totalDamageDealt: number;
  totalDamageTaken: number;
  maxHP: number;
  maxArmor: number;
  
  // ateičiai: paskutinį kartą atnaujinta ir t.t.
  lastUpdatedAt: number;
  
  // Profile picture (NFT image URL)
  selectedProfilePicture?: string; // NFT image URL selected as profile picture
};

export const defaultProfile: PlayerProfile = {
  nickname: "",
  xp: 0,
  winsPvP: 0,
  lossesPvP: 0,
  dotBalance: 0,
  totalSoloKills: 0,
  totalUpgradeAttempts: 0,
  totalUpgradeSuccesses: 0,
  totalUpgradeFailures: 0,
  upgradeSuccessChance: 40, // pradžioje 40%
  totalDamageDealt: 0,
  totalDamageTaken: 0,
  maxHP: 0,
  maxArmor: 0,
  lastUpdatedAt: Date.now(),
};

