import { GameState } from '../game/GameState';
import { CombatSystem } from '../game/CombatSystem';
import { UpgradeSystem } from '../game/UpgradeSystem';
import { DroneSystem, DroneType } from '../game/DroneSystem';
import { ParticleSystem } from '../renderer/ParticleSystem';
import { UIRenderer } from '../renderer/UIRenderer';
import { Renderer } from '../renderer/Renderer';

export class InputManager {
  private canvas: HTMLCanvasElement;
  private gameState: GameState;
  private combatSystem: CombatSystem;
  private upgradeSystem: UpgradeSystem;
  private droneSystem: DroneSystem;
  private particleSystem: ParticleSystem;
  private uiRenderer: UIRenderer;
  private renderer: Renderer;

  constructor(
    canvas: HTMLCanvasElement,
    gameState: GameState,
    combatSystem: CombatSystem,
    upgradeSystem: UpgradeSystem,
    particleSystem: ParticleSystem,
    uiRenderer: UIRenderer,
    renderer: Renderer,
    droneSystem: DroneSystem
  ) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.combatSystem = combatSystem;
    this.upgradeSystem = upgradeSystem;
    this.droneSystem = droneSystem;
    this.particleSystem = particleSystem;
    this.uiRenderer = uiRenderer;
    this.renderer = renderer;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Mouse click
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    
    // Mouse move for hover effects
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if clicking on DOT
    if (this.renderer.isMouseOverDOT(mouseX, mouseY)) {
      this.handleDOTClick();
      return;
    }

    // Check if clicking on upgrade button
    if (this.uiRenderer.isUpgradeButtonClicked(mouseX, mouseY)) {
      this.handleUpgradeClick();
      return;
    }

    // Check if clicking on settings button
    if (this.uiRenderer.isSettingsButtonClicked(mouseX, mouseY)) {
      this.handleSettingsClick();
      return;
    }

    // Check if clicking on drone buttons
    const droneType = this.uiRenderer.getDroneButtonClicked(mouseX, mouseY);
    if (droneType) {
      this.handleDronePurchase(droneType);
      return;
    }
  }

  private handleDOTClick(): void {
    // Check if DOT can be clicked
    if (!this.combatSystem.canClick()) {
      this.uiRenderer.showFeedback('Nepakanka Dot!', '#ff0000', 1.0);
      return;
    }

    // Deduct click cost
    this.gameState.player.dotCurrency -= this.gameState.costs.click;

    // Apply damage
    const damageApplied = this.combatSystem.applyDamage(this.gameState.player.dmg);
    
    if (damageApplied) {
      // Add hit particles
      const dotPos = this.renderer.getDOTPosition();
      this.particleSystem.addHitParticles(dotPos.x, dotPos.y);
      
      // Show damage feedback
      this.uiRenderer.showFeedback(`-${this.gameState.player.dmg}`, '#ff0000', 0.5);
    }
  }

  private handleUpgradeClick(): void {
    const result = this.upgradeSystem.tryUpgrade();
    
    if (result.success) {
      this.uiRenderer.showFeedback(result.message, '#00ff00', 2.0);
    } else {
      this.uiRenderer.showFeedback(result.message, '#ff8800', 2.0);
    }
  }

  private handleSettingsClick(): void {
    // Toggle mute for now
    this.gameState.flags.mute = !this.gameState.flags.mute;
    const message = this.gameState.flags.mute ? 'Garsai išjungti' : 'Garsai įjungti';
    this.uiRenderer.showFeedback(message, '#0000ff', 1.0);
  }

  private handleDronePurchase(type: DroneType): void {
    const cost = this.droneSystem.getDroneCost(type);

    if (!this.droneSystem.canAffordDrone(type)) {
      this.uiRenderer.showFeedback(`Nepakanka Dot! Reikia: ${cost}`, '#ff0000', 1.5);
      return;
    }

    const success = this.droneSystem.purchaseDrone(type);

    if (success) {
      const droneNames: Record<DroneType, string> = {
        attack: 'Attack Drone',
        collector: 'Collector Drone',
        shield: 'Shield Drone'
      };
      const colors: Record<DroneType, string> = {
        attack: '#ff4444',
        collector: '#44ff44',
        shield: '#4444ff'
      };
      this.uiRenderer.showFeedback(`${droneNames[type]} nupirktas!`, colors[type], 2.0);
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if hovering over DOT
    if (this.renderer.isMouseOverDOT(mouseX, mouseY)) {
      this.renderer.setCursor('pointer');
    } else {
      this.renderer.setCursor('default');
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Space bar for clicking DOT
    if (e.code === 'Space') {
      e.preventDefault();
      this.handleDOTClick();
    }

    // U key for upgrade
    if (e.code === 'KeyU') {
      e.preventDefault();
      this.handleUpgradeClick();
    }

    // Number keys for drone purchases
    // 1 = Attack Drone
    if (e.code === 'Digit1' || e.code === 'Numpad1') {
      e.preventDefault();
      this.handleDronePurchase('attack');
    }

    // 2 = Collector Drone
    if (e.code === 'Digit2' || e.code === 'Numpad2') {
      e.preventDefault();
      this.handleDronePurchase('collector');
    }

    // 3 = Shield Drone
    if (e.code === 'Digit3' || e.code === 'Numpad3') {
      e.preventDefault();
      this.handleDronePurchase('shield');
    }
  }
}
