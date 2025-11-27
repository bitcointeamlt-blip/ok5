import { GameState } from '../game/GameState';
import { CombatSystem } from '../game/CombatSystem';
import { ArmorSystem } from '../game/ArmorSystem';
import { ParticleSystem } from './ParticleSystem';
import { UIRenderer } from './UIRenderer';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: GameState;
  private combatSystem: CombatSystem;
  private _armorSystem: ArmorSystem;
  private particleSystem: ParticleSystem;
  private uiRenderer: UIRenderer;
  private dotRadius: number = 32;
  private dotX: number = 0;
  private dotY: number = 0;

  constructor(
    canvas: HTMLCanvasElement,
    gameState: GameState,
    combatSystem: CombatSystem,
    _armorSystem: ArmorSystem,
    particleSystem: ParticleSystem,
    uiRenderer: UIRenderer
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.gameState = gameState;
    this.combatSystem = combatSystem;
    this._armorSystem = _armorSystem;
    this.particleSystem = particleSystem;
    this.uiRenderer = uiRenderer;
  }

  // Calculate DOT position (center of right area)
  private calculateDotPosition(): void {
    const panelWidth = 240;
    const rightAreaWidth = this.canvas.width - panelWidth;
    this.dotX = panelWidth + rightAreaWidth / 2;
    this.dotY = this.canvas.height / 2;
  }

  // Render everything
  render(): void {
    // Clear canvas
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Calculate DOT position
    this.calculateDotPosition();

    // Render DOT
    this.renderDOT();

    // Render UI panel
    this.uiRenderer.render(this.ctx, this.canvas.width, this.canvas.height);

    // Render particles
    this.particleSystem.render(this.ctx);
    
    // Debug info
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Courier New';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`FPS: ${Math.round(1000 / 16)}`, 10, this.canvas.height - 20);
    this.ctx.fillText(`State: ${this.gameState.flags.state}`, 10, this.canvas.height - 5);
  }

  // Render the DOT
  private renderDOT(): void {
    
    // DOT background (white circle)
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(this.dotX, this.dotY, this.dotRadius + 4, 0, Math.PI * 2);
    this.ctx.fill();

    // DOT border
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(this.dotX, this.dotY, this.dotRadius + 4, 0, Math.PI * 2);
    this.ctx.stroke();

    // DOT main circle
    this.ctx.fillStyle = '#000000';
    this.ctx.beginPath();
    this.ctx.arc(this.dotX, this.dotY, this.dotRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Health bar
    this.renderHealthBar();

    // Armor bar
    this.renderArmorBar();

    // DOT state indicator
    this.renderStateIndicator();
  }

  // Render health bar
  private renderHealthBar(): void {
    const barWidth = 100;
    const barHeight = 8;
    const barX = this.dotX - barWidth / 2;
    const barY = this.dotY + this.dotRadius + 20;
    const healthPercentage = this.combatSystem.getHealthPercentage();

    // Background
    this.ctx.fillStyle = '#ffcccc';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health fill
    this.ctx.fillStyle = '#ff0000';
    this.ctx.fillRect(barX, barY, barWidth * healthPercentage, barHeight);

    // Border
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(barX, barY, barWidth, barHeight);

    // Text
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Courier New';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`HP: ${this.gameState.dot.hp}/${this.gameState.dot.maxHP}`, this.dotX, barY - 5);
  }

  // Render armor bar
  private renderArmorBar(): void {
    const barWidth = 100;
    const barHeight = 8;
    const barX = this.dotX - barWidth / 2;
    const barY = this.dotY + this.dotRadius + 40;
    const armorPercentage = this.combatSystem.getArmorPercentage();

    // Background
    this.ctx.fillStyle = '#ccccff';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    // Armor fill
    this.ctx.fillStyle = '#0000ff';
    this.ctx.fillRect(barX, barY, barWidth * armorPercentage, barHeight);

    // Border
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(barX, barY, barWidth, barHeight);

    // Text
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Courier New';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`Armor: ${this.gameState.dot.armor}/${this.gameState.dot.maxArmor}`, this.dotX, barY - 5);
  }

  // Render state indicator
  private renderStateIndicator(): void {
    if (this.gameState.flags.state === 'Dying') {
      // Death animation - shrinking DOT
      const deathProgress = 1 - (this.gameState.timers.death / 2.0);
      const currentRadius = this.dotRadius * (1 - deathProgress * 0.8);
      
      this.ctx.fillStyle = '#000000';
      this.ctx.beginPath();
      this.ctx.arc(this.dotX, this.dotY, currentRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // Death text
      this.ctx.fillStyle = '#ff0000';
      this.ctx.font = 'bold 16px Courier New';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('DOT MIRŠTA!', this.dotX, this.dotY - this.dotRadius - 30);
    }
  }

  // Check if mouse is over DOT
  isMouseOverDOT(mouseX: number, mouseY: number): boolean {
    const dx = mouseX - this.dotX;
    const dy = mouseY - this.dotY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= this.dotRadius;
  }

  // Get DOT position for particles
  getDOTPosition(): { x: number; y: number } {
    return { x: this.dotX, y: this.dotY };
  }

  // Set cursor style
  setCursor(style: string): void {
    this.canvas.style.cursor = style;
  }
}
