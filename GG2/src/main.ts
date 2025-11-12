import { createInitialGameState, GameState } from './game/GameState';
import { CombatSystem } from './game/CombatSystem';
import { ArmorSystem } from './game/ArmorSystem';
import { UpgradeSystem } from './game/UpgradeSystem';
import { ParticleSystem } from './renderer/ParticleSystem';
import { UIRenderer } from './renderer/UIRenderer';
import { Renderer } from './renderer/Renderer';
import { InputManager } from './input/InputManager';
import { SaveManager } from './persistence/SaveManager';
import { AudioManager } from './audio/AudioManager';

class Game {
  private canvas: HTMLCanvasElement;
  private gameState: GameState;
  private combatSystem: CombatSystem;
  private armorSystem: ArmorSystem;
  private upgradeSystem: UpgradeSystem;
  private particleSystem: ParticleSystem;
  private uiRenderer: UIRenderer;
  private renderer: Renderer;
  private _inputManager: InputManager;
  private saveManager: SaveManager;
  private audioManager: AudioManager;
  
  private lastTime: number = 0;
  private isRunning: boolean = false;

  constructor() {
    this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    
    // Initialize game state
    this.gameState = createInitialGameState();
    
    // Initialize systems
    this.combatSystem = new CombatSystem(this.gameState);
    this.armorSystem = new ArmorSystem(this.gameState);
    this.upgradeSystem = new UpgradeSystem(this.gameState);
    this.particleSystem = new ParticleSystem();
    this.uiRenderer = new UIRenderer(this.gameState, this.upgradeSystem);
    this.renderer = new Renderer(
      this.canvas,
      this.gameState,
      this.combatSystem,
      this.armorSystem,
      this.particleSystem,
      this.uiRenderer
    );
    this._inputManager = new InputManager(
      this.canvas,
      this.gameState,
      this.combatSystem,
      this.upgradeSystem,
      this.particleSystem,
      this.uiRenderer,
      this.renderer
    );
    this.saveManager = new SaveManager(this.gameState);
    this.audioManager = new AudioManager();

    this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log('Initializing game...');
    console.log('Canvas:', this.canvas);
    console.log('Canvas size:', this.canvas.width, 'x', this.canvas.height);
    
    // Try to load save data
    const loaded = this.saveManager.load();
    if (loaded) {
      console.log('Loaded existing save data');
    } else {
      console.log('Starting new game');
    }

    // Resume audio context
    await this.audioManager.resumeContext();

    // Start game loop
    this.start();
    console.log('Game started!');
  }

  private start(): void {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.gameLoop();
  }

  private gameLoop = (currentTime: number = 0): void => {
    if (!this.isRunning) return;

    const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    // Update game systems
    this.update(deltaTime);

    // Render everything
    this.render();

    // Continue game loop
    requestAnimationFrame(this.gameLoop);
  };

  private update(deltaTime: number): void {
    // Update combat system (death timer)
    this.combatSystem.updateDeathTimer(deltaTime);

    // Update armor regeneration
    this.armorSystem.update(deltaTime);

    // Update particles
    this.particleSystem.update(deltaTime);

    // Update UI feedback
    this.uiRenderer.update(deltaTime);

    // Auto-save
    this.saveManager.update(deltaTime);

    // Handle DOT death and respawn
    this.handleDOTDeath();
  }

  private handleDOTDeath(): void {
    if (this.gameState.flags.state === 'Dying' && this.gameState.timers.death <= 0) {
      // DOT has respawned
      this.audioManager.playRespawn();
      
      // Add death particles
      const dotPos = this.renderer.getDOTPosition();
      this.particleSystem.addDeathParticles(dotPos.x, dotPos.y);
    }
  }

  private render(): void {
    this.renderer.render();
  }

  // Public methods for external access
  public getGameState(): GameState {
    return this.gameState;
  }

  public getAudioManager(): AudioManager {
    return this.audioManager;
  }

  public getSaveManager(): SaveManager {
    return this.saveManager;
  }

  // Stop the game
  public stop(): void {
    this.isRunning = false;
  }

  // Restart the game
  public restart(): void {
    this.saveManager.reset();
    this.gameState = createInitialGameState();
    this.combatSystem = new CombatSystem(this.gameState);
    this.armorSystem = new ArmorSystem(this.gameState);
    this.upgradeSystem = new UpgradeSystem(this.gameState);
    this.particleSystem.clear();
    this.uiRenderer = new UIRenderer(this.gameState, this.upgradeSystem);
    this.renderer = new Renderer(
      this.canvas,
      this.gameState,
      this.combatSystem,
      this.armorSystem,
      this.particleSystem,
      this.uiRenderer
    );
    this._inputManager = new InputManager(
      this.canvas,
      this.gameState,
      this.combatSystem,
      this.upgradeSystem,
      this.particleSystem,
      this.uiRenderer,
      this.renderer
    );
    this.saveManager = new SaveManager(this.gameState);
  }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  
  // Make game accessible globally for debugging
  (window as any).game = game;
  
  console.log('DOT Clicker initialized!');
  console.log('Controls: Click DOT or press Space to attack, U to upgrade');
});
