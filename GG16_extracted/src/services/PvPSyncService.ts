// PvP Sync Service for real-time input synchronization
import { supabaseService } from './SupabaseService';

export interface PlayerInput {
  type: 'click' | 'arrow' | 'projectile' | 'position' | 'arrow_position' | 'projectile_position' | 'line' | 'projectile_explode' | 'stats';
  timestamp: number;
  x?: number; // Click position or arrow/projectile start X or player position X or arrow/projectile current X
  y?: number; // Click position or arrow/projectile start Y or player position Y or arrow/projectile current Y
  vx?: number; // Player velocity X or arrow/projectile velocity X
  vy?: number; // Player velocity Y or arrow/projectile velocity Y
  targetX?: number; // Arrow/projectile target X
  targetY?: number; // Arrow/projectile target Y
  chargeTime?: number; // For projectiles
  isCrit?: boolean; // Whether this was a crit hit
  angle?: number; // Arrow rotation angle
  points?: Array<{ x: number; y: number }>; // For drawn lines
  hp?: number; // Player HP (for stats sync)
  armor?: number; // Player Armor (for stats sync)
  maxHP?: number; // Player Max HP (for stats sync)
  maxArmor?: number; // Player Max Armor (for stats sync)
  dmg?: number; // Player damage stat (for arrow/projectile damage calculation)
}

export interface OpponentInputCallback {
  (input: PlayerInput): void;
}

class PvPSyncService {
  private currentMatchId: string | null = null;
  private myAddress: string | null = null;
  private realtimeChannel: any = null;
  private isChannelSubscribed: boolean = false; // Track subscription status
  private inputCallback: OpponentInputCallback | null = null;
  private lastInputTime: number = 0;
  // OPTIMIZED for high latency: Reduce frequency to avoid network overload and prevent lag
  // Reduced from 20/sec to 10/sec to prevent network congestion
  private readonly MAX_INPUTS_PER_SECOND = 10; // Reduced from 20 to 10 to prevent lag
  private readonly MIN_INPUT_INTERVAL = 1000 / this.MAX_INPUTS_PER_SECOND;
  private pendingInputs: PlayerInput[] = []; // Batch inputs together
  private batchTimeout: number | null = null;

  // Start sync for a match
  startSync(matchId: string, myAddress: string, onOpponentInput: OpponentInputCallback): boolean {
    const client = supabaseService.getClient();
    if (!client) {
      console.error('Supabase client not available');
      return false;
    }

    // CRITICAL: Prevent duplicate sync for the same match (HMR protection)
    if (this.currentMatchId === matchId && this.isChannelSubscribed) {
      console.warn(`⚠️ Sync already active for match ${matchId} - skipping duplicate start (HMR protection)`);
      return true; // Return true since sync is already active
    }

    // Stop any existing sync first
    this.stopSync();

    this.currentMatchId = matchId;
    this.myAddress = myAddress;
    this.inputCallback = onOpponentInput;
    this.lastInputTime = 0;
    this.isChannelSubscribed = false; // Reset subscription status
    this.pendingInputs = []; // Clear any old pending inputs

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
          // Payload structure: { payload: { from: string, input: PlayerInput } }
          const inputData = payload.payload || payload;
          if (inputData && inputData.from !== myAddress) {
            this.handleOpponentInput(inputData.input);
          }
        }
      )
      .subscribe((status: string) => {
        // Only log important statuses to reduce console spam
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.log(`Channel subscription status: ${status} for match_${matchId}`);
        }
        
        if (status === 'SUBSCRIBED') {
          this.isChannelSubscribed = true; // Mark as subscribed
          console.log(`✅ Subscribed to match channel: match_${matchId} (WebSocket active)`);
          
          // Try to flush any queued inputs now that we're subscribed
          if (this.pendingInputs.length > 0) {
            console.log(`Flushing ${this.pendingInputs.length} queued inputs after subscription`);
            // Use setTimeout to ensure subscription is fully ready
            setTimeout(() => {
              this.flushBatch();
            }, 50); // Reduced delay
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.isChannelSubscribed = false; // Mark as not subscribed
          // Only log CLOSED if it's unexpected (not during initial connection)
          if (status === 'CLOSED' && this.currentMatchId === matchId) {
            console.warn(`⚠️ Channel closed unexpectedly for match_${matchId} - will retry if needed`);
          } else if (status !== 'CLOSED') {
            console.error(`❌ Channel subscription failed: ${status} - Check if Realtime is enabled in Supabase Dashboard → Settings → API`);
            // Helpful error message for user
            if (status === 'CHANNEL_ERROR') {
              console.error('💡 TIP: Make sure Realtime is enabled in Supabase Dashboard → Settings → API');
            }
          }
        } else {
          // Other statuses like 'JOINING', 'JOINED', 'LEAVING' - not ready yet
          this.isChannelSubscribed = false;
          console.log(`Channel status: ${status} (connecting...)`);
        }
      });

    return true;
  }

  // Stop sync
  stopSync(): void {
    // Flush any pending inputs before stopping
    this.flushBatch();
    
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
    }
    this.isChannelSubscribed = false; // Reset subscription status

    this.currentMatchId = null;
    this.myAddress = null;
    this.inputCallback = null;
    this.pendingInputs = [];
  }

  // Send input to opponent (non-blocking with batching for better performance)
  sendInput(input: PlayerInput): boolean {
    if (!this.currentMatchId || !this.myAddress) {
      return false;
    }

    // Add to batch
    this.pendingInputs.push(input);

    // If this is a critical input (click, arrow, projectile, position), send immediately
    // Position updates are now critical for real-time movement
    const isCritical = input.type === 'click' || input.type === 'arrow' || input.type === 'projectile' || 
                       input.type === 'position' || input.type === 'arrow_position' || input.type === 'projectile_position';
    
    if (isCritical || this.pendingInputs.length >= 3) {
      // Send batch immediately for critical inputs (including position) or when batch is full
      this.flushBatch();
    } else {
      // For non-critical inputs, batch them together (send after 100ms delay)
      // Increased delay to match position sync interval (100ms = 10 times per second)
      if (this.batchTimeout === null) {
        this.batchTimeout = window.setTimeout(() => {
          this.flushBatch();
        }, 100); // Matches position sync interval for consistency (reduced frequency to prevent lag)
      }
    }

    return true;
  }

  // Flush pending inputs as a batch
  private flushBatch(): void {
    if (this.pendingInputs.length === 0) {
      return;
    }

    // Rate limiting check - but allow position updates to bypass for real-time movement
    const now = Date.now();
    if (now - this.lastInputTime < this.MIN_INPUT_INTERVAL && this.pendingInputs.length < 3) {
      // Too soon, but if we have critical inputs (including position), send anyway
      const hasCritical = this.pendingInputs.some(inp => 
        inp.type === 'click' || inp.type === 'arrow' || inp.type === 'projectile' ||
        inp.type === 'position' || inp.type === 'arrow_position' || inp.type === 'projectile_position'
      );
      if (!hasCritical) {
        return; // Skip non-critical inputs if rate limited
      }
    }

    const client = supabaseService.getClient();
    if (!client || !this.currentMatchId) {
      this.pendingInputs = [];
      return;
    }

    // Clear timeout
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    // Send all pending inputs (Supabase broadcast can handle multiple)
    const inputsToSend = [...this.pendingInputs];
    this.pendingInputs = [];

    // CRITICAL: Only use the already-subscribed channel from startSync()
    // Never create a new channel here - that causes REST API fallback
    if (!this.realtimeChannel) {
      console.error('Cannot send input: realtimeChannel not initialized. Call startSync() first.');
      this.pendingInputs = [];
      return;
    }
    
    // CRITICAL: Only send if channel is actually subscribed
    // Sending on unsubscribed channel causes REST API fallback warning
    if (!this.isChannelSubscribed) {
      // Re-add inputs to pending queue to send later (silently, no console.warn to reduce spam)
      this.pendingInputs.unshift(...inputsToSend);
      return;
    }
    
    // Double-check channel state before sending
    if (!this.realtimeChannel) {
      console.error('Cannot send: realtimeChannel is null');
      this.pendingInputs.unshift(...inputsToSend);
      return;
    }
    
    // Send each input using the subscribed channel
    // The channel must be subscribed (from startSync) to use broadcast
    inputsToSend.forEach((input) => {
      // Use the subscribed channel - this avoids REST API fallback
      this.realtimeChannel.send({
        type: 'broadcast',
        event: 'player_input',
        payload: {
          from: this.myAddress,
          input: input,
        },
             }).catch((error: any) => {
        console.error('Error sending input:', error);
      });
    });

    this.lastInputTime = now;
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

