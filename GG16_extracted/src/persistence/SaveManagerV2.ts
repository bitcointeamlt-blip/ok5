import { SaveDataV2, SaveDataV1, migrateV1ToV2, createInitialSaveDataV2 } from './SaveDataV2';

export class SaveManagerV2 {
  private static readonly SAVE_KEY_V2 = 'dot_clicker_save_v2';
  private static readonly SAVE_KEY_V1 = 'dot_clicker_save_v1'; // For migration
  private static readonly AUTOSAVE_INTERVAL = 10; // seconds

  private lastSaveTime: number = 0;

  // Save game state to localStorage
  save(saveData: SaveDataV2): void {
    try {
      const dataToSave = {
        ...saveData,
        profile: {
          ...saveData.profile,
          lastPlayed: Date.now(),
        },
      };
      
      localStorage.setItem(SaveManagerV2.SAVE_KEY_V2, JSON.stringify(dataToSave));
      this.lastSaveTime = Date.now();
      console.log('Game saved successfully (V2)');
    } catch (error) {
      console.error('Failed to save game:', error);
    }
  }

  // Load game state from localStorage
  load(): SaveDataV2 | null {
    try {
      // First, try to load V2 save
      const v2Data = localStorage.getItem(SaveManagerV2.SAVE_KEY_V2);
      
      if (v2Data) {
        const parsedData = JSON.parse(v2Data) as SaveDataV2;
        
        // Validate version
        if (parsedData.version === 2) {
          console.log('Game loaded successfully (V2)');
          return parsedData;
        } else {
          console.log('Save version mismatch, attempting migration...');
        }
      }

      // If no V2 save, try to migrate from V1
      const v1Data = localStorage.getItem(SaveManagerV2.SAVE_KEY_V1);
      
      if (v1Data) {
        try {
          const parsedV1 = JSON.parse(v1Data) as SaveDataV1;
          const migrated = migrateV1ToV2(parsedV1);
          
          // Save migrated data as V2
          this.save(migrated);
          
          // Optionally remove V1 save (or keep it as backup)
          // localStorage.removeItem(SaveManagerV2.SAVE_KEY_V1);
          
          console.log('Migrated V1 save to V2');
          return migrated;
        } catch (error) {
          console.error('Failed to migrate V1 save:', error);
        }
      }

      console.log('No save data found');
      return null;
    } catch (error) {
      console.error('Failed to load game:', error);
      return null;
    }
  }

  // Auto-save if enough time has passed
  shouldAutoSave(): boolean {
    const currentTime = Date.now();
    const timeSinceLastSave = (currentTime - this.lastSaveTime) / 1000;
    
    return timeSinceLastSave >= SaveManagerV2.AUTOSAVE_INTERVAL;
  }

  // Force save (call after important events)
  forceSave(saveData: SaveDataV2): void {
    this.save(saveData);
  }

  // Reset game to initial state
  reset(): void {
    try {
      localStorage.removeItem(SaveManagerV2.SAVE_KEY_V2);
      // Optionally remove V1 as well
      localStorage.removeItem(SaveManagerV2.SAVE_KEY_V1);
      console.log('Game reset successfully');
    } catch (error) {
      console.error('Failed to reset game:', error);
    }
  }

  // Check if save data exists
  hasSaveData(): boolean {
    return localStorage.getItem(SaveManagerV2.SAVE_KEY_V2) !== null || 
           localStorage.getItem(SaveManagerV2.SAVE_KEY_V1) !== null;
  }

  // Get save info
  getSaveInfo(): { exists: boolean; timestamp?: number; version?: number } {
    try {
      const v2Data = localStorage.getItem(SaveManagerV2.SAVE_KEY_V2);
      
      if (v2Data) {
        const parsedData = JSON.parse(v2Data) as SaveDataV2;
        return {
          exists: true,
          timestamp: parsedData.profile.lastPlayed,
          version: parsedData.version,
        };
      }

      const v1Data = localStorage.getItem(SaveManagerV2.SAVE_KEY_V1);
      
      if (v1Data) {
        const parsedData = JSON.parse(v1Data) as SaveDataV1;
        return {
          exists: true,
          timestamp: parsedData.timestamp,
          version: parsedData.saveVersion || 1,
        };
      }

      return { exists: false };
    } catch (error) {
      console.error('Failed to get save info:', error);
      return { exists: false };
    }
  }
}


