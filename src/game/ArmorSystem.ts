import { GameState } from './GameState';

export class ArmorSystem {
  private gameState: GameState;

  constructor(gameState: GameState) {
    this.gameState = gameState;
  }

  // Update armor regeneration
  update(deltaTime: number): void {
    if (this.gameState.flags.state !== 'Alive') {
      return;
    }

    // Increment damage timer
    this.gameState.timers.sinceDamage += deltaTime;

    // Check if enough time has passed for armor regen
    if (this.gameState.timers.sinceDamage >= this.gameState.timers.armorRegenEvery) {
      this.regenerateArmor();
      // Reset timer for continuous regen
      this.gameState.timers.sinceDamage = 0;
    }
  }

  // Regenerate armor by 10% of max armor
  private regenerateArmor(): void {
    const regenAmount = Math.ceil(0.1 * this.gameState.dot.maxArmor);
    this.gameState.dot.armor = Math.min(
      this.gameState.dot.maxArmor,
      this.gameState.dot.armor + regenAmount
    );
  }

  // Get armor regeneration progress (0-1)
  getRegenProgress(): number {
    return Math.min(1, this.gameState.timers.sinceDamage / this.gameState.timers.armorRegenEvery);
  }

  // Check if armor is at maximum
  isArmorFull(): boolean {
    return this.gameState.dot.armor >= this.gameState.dot.maxArmor;
  }
}
