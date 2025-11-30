import { PlayerProfile, defaultProfile } from "../types/profile";

const STORAGE_KEY = "dot-game-profile-v1";

export class ProfileManager {
  private profile: PlayerProfile;

  constructor() {
    this.profile = this.loadProfile();
  }

  private loadProfile(): PlayerProfile {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with default to ensure all fields exist
        return { ...defaultProfile, ...parsed };
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    }
    return { ...defaultProfile };
  }

  private saveProfile(): void {
    try {
      this.profile.lastUpdatedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch (error) {
      console.error("Failed to save profile:", error);
    }
  }

  getProfile(): PlayerProfile {
    return { ...this.profile };
  }

  updateProfile(partial: Partial<PlayerProfile>): void {
    this.profile = { ...this.profile, ...partial };
    this.saveProfile();
  }

  setNickname(nickname: string): void {
    this.profile.nickname = nickname.substring(0, 16); // Max 16 chars
    this.saveProfile();
  }

  addXP(amount: number): void {
    this.profile.xp = Math.max(0, this.profile.xp + amount);
    this.saveProfile();
  }

  addWinPvP(): void {
    this.profile.winsPvP++;
    this.saveProfile();
  }

  addLossPvP(): void {
    this.profile.lossesPvP++;
    this.saveProfile();
  }

  addSoloKill(): void {
    this.profile.totalSoloKills++;
    this.saveProfile();
  }

  addUpgradeAttempt(): void {
    this.profile.totalUpgradeAttempts++;
    this.saveProfile();
  }

  addUpgradeSuccess(): void {
    this.profile.totalUpgradeSuccesses++;
    this.saveProfile();
  }

  addUpgradeFailure(): void {
    this.profile.totalUpgradeFailures++;
    this.saveProfile();
  }

  addDot(amount: number): void {
    this.profile.dotBalance += amount;
    this.saveProfile();
  }

  addDamageDealt(amount: number): void {
    this.profile.totalDamageDealt += amount;
    this.saveProfile();
  }

  addDamageTaken(amount: number): void {
    this.profile.totalDamageTaken += amount;
    this.saveProfile();
  }

  updateMaxStats(currentHP: number, currentArmor: number): void {
    if (currentHP > this.profile.maxHP) {
      this.profile.maxHP = currentHP;
    }
    if (currentArmor > this.profile.maxArmor) {
      this.profile.maxArmor = currentArmor;
    }
    this.saveProfile();
  }

  setProfilePicture(imageUrl: string | undefined): void {
    this.profile.selectedProfilePicture = imageUrl;
    this.saveProfile();
  }

  getProfilePicture(): string | undefined {
    return this.profile.selectedProfilePicture;
  }
}

