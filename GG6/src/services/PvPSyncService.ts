// PvP Sync Service for real-time input synchronization
import { supabaseService } from './SupabaseService';

export interface PlayerInput {
  type: 'click' | 'arrow' | 'projectile' | 'position';
  timestamp: number;
  x?: number; // Click position or arrow/projectile start X or player position X
  y?: number; // Click position or arrow/projectile start Y or player position Y
  vx?: number; // Player velocity X
  vy?: number; // Player velocity Y
  targetX?: number; // Arrow/projectile target X
  targetY?: number; // Arrow/projectile target Y
  chargeTime?: number; // For projectiles
  isCrit?: boolean; // Whether this was a crit hit
}

export interface OpponentInputCallback {
  (input: PlayerInput): void;
}

class PvPSyncService {
  private currentMatchId: string | null = null;
  private myAddress: string | null = null;
  private realtimeChannel: any = null;
  private inputCallback: OpponentInputCallback | null = null;
  private lastInputTime: number = 0;
  private readonly MAX_INPUTS_PER_SECOND = 12;
  private readonly MIN_INPUT_INTERVAL = 1000 / this.MAX_INPUTS_PER_SECOND;

  // Start sync for a match
  startSync(matchId: string, myAddress: string, onOpponentInput: OpponentInputCallback): boolean {
    const client = supabaseService.getClient();
    if (!client) {
      console.error('Supabase client not available');
      return false;
    }

    this.currentMatchId = matchId;
    this.myAddress = myAddress;
    this.inputCallback = onOpponentInput;
    this.lastInputTime = 0;

    // Subscribe to match channel
    this.realtimeChannel = client
      .channel(`match_${matchId}`)
      .on(
        'broadcast',
        {
          event: 'player_input',
        },
        (payload: any) => {
          // Only process inputs from opponent
          if (payload.payload.from !== myAddress) {
            this.handleOpponentInput(payload.payload.input);
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to match channel: match_${matchId}`);
        }
      });

    return true;
  }

  // Stop sync
  stopSync(): void {
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
    }

    this.currentMatchId = null;
    this.myAddress = null;
    this.inputCallback = null;
  }

  // Send input to opponent
  async sendInput(input: PlayerInput): Promise<boolean> {
    if (!this.currentMatchId || !this.myAddress) {
      return false;
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastInputTime < this.MIN_INPUT_INTERVAL) {
      return false; // Too many inputs, skip
    }

    const client = supabaseService.getClient();
    if (!client) {
      return false;
    }

    try {
      const channel = client.channel(`match_${this.currentMatchId}`);
      
      await channel.send({
        type: 'broadcast',
        event: 'player_input',
        payload: {
          from: this.myAddress,
          input: input,
        },
      });

      this.lastInputTime = now;
      return true;
    } catch (error) {
      console.error('Error sending input:', error);
      return false;
    }
  }

  // Handle received opponent input
  private handleOpponentInput(input: PlayerInput): void {
    if (this.inputCallback) {
      this.inputCallback(input);
    }
  }

  // Check if syncing
  isSyncing(): boolean {
    return this.currentMatchId !== null;
  }

  // Get current match ID
  getCurrentMatchId(): string | null {
    return this.currentMatchId;
  }
}

// Export singleton instance
export const pvpSyncService = new PvPSyncService();

