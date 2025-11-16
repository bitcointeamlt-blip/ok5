import { GameState } from '../game/GameState';

export class SaveManager {
  private static readonly SAVE_KEY = 'dot_clicker_save_v1';
  private static readonly AUTOSAVE_INTERVAL = 10; // seconds

  private gameState: GameState;
  private lastSaveTime: number = 0;

  constructor(gameState: GameState) {
    this.gameState = gameState;
  }

  // Save game state to localStorage
  save(): void {
    try {
      const saveData = {
        ...this.gameState,
        timestamp: Date.now()
      };
      
      localStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(saveData));
      this.lastSaveTime = Date.now();
      console.log('Game saved successfully');
    } catch (error) {
      console.error('Failed to save game:', error);
    }
  }

  // Load game state from localStorage
  load(): boolean {
    try {
      const saveData = localStorage.getItem(SaveManager.SAVE_KEY);
      
      if (!saveData) {
        console.log('No save data found');
        return false;
      }

      const parsedData = JSON.parse(saveData);
      
      // Validate save version
      if (parsedData.saveVersion !== this.gameState.saveVersion) {
        console.log('Save version mismatch, starting fresh');
        return false;
      }

      // Restore game state
      Object.assign(this.gameState, parsedData);
      
      // Ensure timers are reset on load
      this.gameState.timers.sinceDamage = 0;
      this.gameState.timers.death = 0;
      
      // Ensure state is alive on load
      this.gameState.flags.state = 'Alive';
      
      console.log('Game loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load game:', error);
      return false;
    }
  }

  // Auto-save if enough time has passed
  update(_deltaTime: number): void {
    const currentTime = Date.now();
    const timeSinceLastSave = (currentTime - this.lastSaveTime) / 1000;
    
    if (timeSinceLastSave >= SaveManager.AUTOSAVE_INTERVAL) {
      this.save();
    }
  }

  // Force save (call after important events)
  forceSave(): void {
    this.save();
  }

  // Reset game to initial state
  reset(): void {
    try {
      localStorage.removeItem(SaveManager.SAVE_KEY);
      console.log('Game reset successfully');
    } catch (error) {
      console.error('Failed to reset game:', error);
    }
  }

  // Check if save data exists
  hasSaveData(): boolean {
    return localStorage.getItem(SaveManager.SAVE_KEY) !== null;
  }

  // Get save info
  getSaveInfo(): { exists: boolean; timestamp?: number; version?: number } {
    try {
      const saveData = localStorage.getItem(SaveManager.SAVE_KEY);
      
      if (!saveData) {
        return { exists: false };
      }

      const parsedData = JSON.parse(saveData);
      return {
        exists: true,
        timestamp: parsedData.timestamp,
        version: parsedData.saveVersion
      };
    } catch (error) {
      console.error('Failed to get save info:', error);
      return { exists: false };
    }
  }
}
