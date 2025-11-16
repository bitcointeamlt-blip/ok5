import { GameState, calculateReward } from './GameState';

export class CombatSystem {
  private gameState: GameState;

  constructor(gameState: GameState) {
    this.gameState = gameState;
  }

  // Apply damage to DOT
  applyDamage(dmg: number): boolean {
    if (this.gameState.flags.state !== 'Alive') {
      return false;
    }

    // Reset damage timer for armor regen
    this.gameState.timers.sinceDamage = 0;

    // Apply damage: Armor absorbs first, then HP
    const absorbed = Math.min(dmg, this.gameState.dot.armor);
    this.gameState.dot.armor -= absorbed;
    
    const remainingDamage = dmg - absorbed;
    this.gameState.dot.hp -= remainingDamage;

    // Check for death
    if (this.gameState.dot.hp <= 0) {
      this.onDotDeath();
      return true;
    }

    return true;
  }

  // Handle DOT death
  private onDotDeath(): void {
    // Award currency
    this.gameState.player.dotCurrency += this.gameState.dot.reward;
    
    // Set state to dying
    this.gameState.flags.state = 'Dying';
    this.gameState.timers.death = 2.0; // 2 second death animation
  }

  // Update death timer and handle respawn
  updateDeathTimer(deltaTime: number): void {
    if (this.gameState.flags.state === 'Dying') {
      this.gameState.timers.death -= deltaTime;
      
      if (this.gameState.timers.death <= 0) {
        this.respawnDot();
      }
    }
  }

  // Respawn DOT with scaling
  private respawnDot(): void {
    // Scale DOT stats
    this.gameState.dot.maxHP = Math.round(this.gameState.dot.maxHP * this.gameState.dot.scaler.hp);
    this.gameState.dot.maxArmor = Math.round(this.gameState.dot.maxArmor * this.gameState.dot.scaler.armor);
    
    // Reset HP and Armor
    this.gameState.dot.hp = this.gameState.dot.maxHP;
    this.gameState.dot.armor = this.gameState.dot.maxArmor;
    
    // Recalculate reward
    this.gameState.dot.reward = calculateReward(this.gameState.dot.maxHP, this.gameState.dot.maxArmor);
    
    // Reset timers
    this.gameState.timers.sinceDamage = 0;
    this.gameState.timers.death = 0;
    
    // Return to alive state
    this.gameState.flags.state = 'Alive';
  }

  // Check if DOT can be clicked
  canClick(): boolean {
    return this.gameState.flags.state === 'Alive' && 
           this.gameState.player.dotCurrency >= this.gameState.costs.click;
  }

  // Get current DOT health percentage
  getHealthPercentage(): number {
    return this.gameState.dot.hp / this.gameState.dot.maxHP;
  }

  // Get current DOT armor percentage
  getArmorPercentage(): number {
    return this.gameState.dot.armor / this.gameState.dot.maxArmor;
  }
}
