import { GameState, calculateUpgradeCost } from './GameState';
import { rng } from '../utils/RNG';

export class UpgradeSystem {
  private gameState: GameState;

  constructor(gameState: GameState) {
    this.gameState = gameState;
  }

  // Try to upgrade DMG
  tryUpgrade(): { success: boolean; message: string } {
    const cost = this.getUpgradeCost();
    
    // Check if player has enough currency
    if (this.gameState.player.dotCurrency < cost) {
      return {
        success: false,
        message: 'Nepakanka Dot!'
      };
    }

    // Deduct currency
    this.gameState.player.dotCurrency -= cost;

    // Roll for success
    const success = rng.randomBool(this.gameState.upgrade.successChance);
    
    if (success) {
      // Upgrade successful
      this.gameState.player.dmg += 1;
      this.gameState.upgrade.level += 1;
      
      return {
        success: true,
        message: `DMG padidintas! Dabar: ${this.gameState.player.dmg}`
      };
    } else {
      // Upgrade failed - currency is lost
      return {
        success: false,
        message: 'Upgrade nepavyko! Valiuta sudegė.'
      };
    }
  }

  // Get current upgrade cost
  getUpgradeCost(): number {
    return calculateUpgradeCost(
      this.gameState.upgrade.level,
      this.gameState.costs.upgradeBase,
      this.gameState.costs.upgradeGrowth
    );
  }

  // Check if player can afford upgrade
  canAffordUpgrade(): boolean {
    return this.gameState.player.dotCurrency >= this.getUpgradeCost();
  }

  // Get success chance as percentage
  getSuccessChancePercentage(): number {
    return Math.round(this.gameState.upgrade.successChance * 100);
  }

  // Get upgrade level
  getUpgradeLevel(): number {
    return this.gameState.upgrade.level;
  }
}
