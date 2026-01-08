import { GameState } from '../game/GameState';
import { UpgradeSystem } from '../game/UpgradeSystem';

export class UIRenderer {
  private gameState: GameState;
  private upgradeSystem: UpgradeSystem;
  private panelWidth: number = 240;
  private feedbackMessage: string = '';
  private feedbackTimer: number = 0;
  private feedbackColor: string = '#000000';

  constructor(gameState: GameState, upgradeSystem: UpgradeSystem) {
    this.gameState = gameState;
    this.upgradeSystem = upgradeSystem;
  }

  // Show feedback message
  showFeedback(message: string, color: string = '#000000', duration: number = 2.0): void {
    this.feedbackMessage = message;
    this.feedbackColor = color;
    this.feedbackTimer = duration;
  }

  // Update feedback timer
  update(deltaTime: number): void {
    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= deltaTime;
    }
  }

  // Render the left UI panel
  render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    const panelX = 0;
    const panelY = 0;
    const panelHeight = canvasHeight;

    // Panel background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(panelX, panelY, this.panelWidth, panelHeight);

    // Panel border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, this.panelWidth, panelHeight);

    // Currency display
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText(`Dot: ${this.gameState.player.dotCurrency}`, panelX + 20, 40);

    // DMG display
    ctx.font = 'bold 18px Courier New';
    ctx.fillText(`DMG: ${this.gameState.player.dmg}`, panelX + 20, 70);

    // DOT stats
    ctx.font = '14px Courier New';
    ctx.fillText(`DOT HP: ${this.gameState.dot.hp}/${this.gameState.dot.maxHP}`, panelX + 20, 100);
    ctx.fillText(`DOT Armor: ${this.gameState.dot.armor}/${this.gameState.dot.maxArmor}`, panelX + 20, 120);

    // Upgrade button
    this.renderUpgradeButton(ctx, panelX + 20, 160);

    // Settings button (placeholder)
    this.renderSettingsButton(ctx, panelX + 20, 220);

    // Future buttons (disabled)
    this.renderFutureButtons(ctx, panelX + 20, 280);

    // Feedback message
    if (this.feedbackTimer > 0) {
      this.renderFeedback(ctx, canvasWidth, canvasHeight);
    }
  }

  // Render upgrade button
  private renderUpgradeButton(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const cost = this.upgradeSystem.getUpgradeCost();
    const canAfford = this.upgradeSystem.canAffordUpgrade();
    const successChance = this.upgradeSystem.getSuccessChancePercentage();

    // Button background
    ctx.fillStyle = canAfford ? '#e0e0e0' : '#cccccc';
    ctx.fillRect(x, y, 200, 40);

    // Button border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 200, 40);

    // Button text
    ctx.fillStyle = canAfford ? '#000000' : '#666666';
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`Upgrade DMG`, x + 100, y + 20);

    // Cost and success info
    ctx.font = '12px Courier New';
    ctx.fillText(`Kaina: ${cost} •`, x + 100, y + 35);
    ctx.fillText(`Sėkmė: ${successChance}%`, x + 100, y + 50);
  }

  // Render settings button
  private renderSettingsButton(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Button background
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(x, y, 200, 30);

    // Button border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 200, 30);

    // Button text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`⚙️ Settings`, x + 100, y + 20);
  }

  // Render future buttons (disabled)
  private renderFutureButtons(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const buttons = [
      'Auto-Clicker (Coming Soon)',
      'Crit Chance (Coming Soon)',
      'Multi-Click (Coming Soon)'
    ];

    buttons.forEach((text, index) => {
      const buttonY = y + index * 35;
      
      // Button background
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(x, buttonY, 200, 30);

      // Button border
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, buttonY, 200, 30);

      // Button text
      ctx.fillStyle = '#999999';
      ctx.font = '12px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(text, x + 100, buttonY + 20);
    });
  }

  // Render feedback message
  private renderFeedback(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    const alpha = Math.min(1, this.feedbackTimer / 0.5); // Fade in/out
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.feedbackColor;
    ctx.font = 'bold 20px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(this.feedbackMessage, canvasWidth / 2, canvasHeight / 2 - 50);
    ctx.restore();
  }

  // Check if upgrade button was clicked
  isUpgradeButtonClicked(mouseX: number, mouseY: number): boolean {
    const x = 20;
    const y = 160;
    return mouseX >= x && mouseX <= x + 200 && mouseY >= y && mouseY <= y + 40;
  }

  // Check if settings button was clicked
  isSettingsButtonClicked(mouseX: number, mouseY: number): boolean {
    const x = 20;
    const y = 220;
    return mouseX >= x && mouseX <= x + 200 && mouseY >= y && mouseY <= y + 30;
  }
}
