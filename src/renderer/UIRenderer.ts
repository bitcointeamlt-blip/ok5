import { GameState } from '../game/GameState';
import { UpgradeSystem } from '../game/UpgradeSystem';
import { DroneSystem, DroneType, DRONE_COSTS } from '../game/DroneSystem';

export class UIRenderer {
  private gameState: GameState;
  private upgradeSystem: UpgradeSystem;
  private droneSystem: DroneSystem | null = null;
  private panelWidth: number = 240;
  private feedbackMessage: string = '';
  private feedbackTimer: number = 0;
  private feedbackColor: string = '#000000';

  constructor(gameState: GameState, upgradeSystem: UpgradeSystem) {
    this.gameState = gameState;
    this.upgradeSystem = upgradeSystem;
  }

  // Set drone system reference
  setDroneSystem(droneSystem: DroneSystem): void {
    this.droneSystem = droneSystem;
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

    // Drone purchase buttons
    this.renderDroneButtons(ctx, panelX + 20, 280);

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
    ctx.fillText(`Cost: ${cost} •`, x + 100, y + 35);
    ctx.fillText(`Success: ${successChance}%`, x + 100, y + 50);
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

  // Render drone purchase buttons
  private renderDroneButtons(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.droneSystem) return;

    // Section title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('HELPER DRONES', x, y - 10);

    const droneTypes: { type: DroneType; label: string; icon: string; desc: string }[] = [
      { type: 'attack', label: 'Attack', icon: '⚔️', desc: 'Auto-atakuoja' },
      { type: 'collector', label: 'Collector', icon: '💰', desc: '+5 Dot/kill' },
      { type: 'shield', label: 'Shield', icon: '🛡️', desc: '-10% armor' }
    ];

    droneTypes.forEach((drone, index) => {
      const buttonY = y + index * 50;
      const cost = this.droneSystem!.getDroneCost(drone.type);
      const count = this.droneSystem!.getDroneCountByType(drone.type);
      const canAfford = this.droneSystem!.canAffordDrone(drone.type);

      // Button background
      ctx.fillStyle = canAfford ? this.getDroneColor(drone.type, 0.2) : '#f0f0f0';
      ctx.fillRect(x, buttonY, 200, 45);

      // Button border
      ctx.strokeStyle = canAfford ? this.getDroneColor(drone.type, 1) : '#cccccc';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, buttonY, 200, 45);

      // Icon and label
      ctx.fillStyle = canAfford ? '#000000' : '#999999';
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(`${drone.icon} ${drone.label} Drone`, x + 10, buttonY + 15);

      // Count
      ctx.font = 'bold 14px Courier New';
      ctx.textAlign = 'right';
      ctx.fillStyle = this.getDroneColor(drone.type, 1);
      ctx.fillText(`x${count}`, x + 190, buttonY + 15);

      // Cost and description
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillStyle = canAfford ? '#000000' : '#999999';
      ctx.fillText(`${drone.desc}`, x + 10, buttonY + 30);
      ctx.fillText(`Cost: ${cost} Dot`, x + 10, buttonY + 40);
    });
  }

  // Get drone color with alpha
  private getDroneColor(type: DroneType, alpha: number): string {
    const colors: Record<DroneType, string> = {
      attack: `rgba(255, 68, 68, ${alpha})`,
      collector: `rgba(68, 255, 68, ${alpha})`,
      shield: `rgba(68, 68, 255, ${alpha})`
    };
    return colors[type];
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

  // Check if a drone button was clicked and return the type
  getDroneButtonClicked(mouseX: number, mouseY: number): DroneType | null {
    const x = 20;
    const baseY = 280;
    const buttonHeight = 45;
    const buttonSpacing = 50;

    const droneTypes: DroneType[] = ['attack', 'collector', 'shield'];

    for (let i = 0; i < droneTypes.length; i++) {
      const buttonY = baseY + i * buttonSpacing;
      if (mouseX >= x && mouseX <= x + 200 && mouseY >= buttonY && mouseY <= buttonY + buttonHeight) {
        return droneTypes[i];
      }
    }

    return null;
  }
}
