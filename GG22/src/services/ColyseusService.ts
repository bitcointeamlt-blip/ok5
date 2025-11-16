// Colyseus Service for PvP multiplayer
import { Client, Room } from "colyseus.js";

export interface PlayerInput {
  type: 'click' | 'arrow' | 'projectile' | 'position' | 'arrow_position' | 'projectile_position' | 'line' | 'projectile_explode' | 'stats' | 'bullet' | 'hit';
  timestamp: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  targetX?: number;
  targetY?: number;
  chargeTime?: number;
  isCrit?: boolean;
  angle?: number;
  points?: Array<{ x: number; y: number }>; // For drawn lines
  hp?: number; // Player HP (for stats sync)
  armor?: number; // Player Armor (for stats sync)
  maxHP?: number; // Player Max HP (for stats sync)
  maxArmor?: number; // Player Max Armor (for stats sync)
  dmg?: number; // Player damage stat (for arrow/projectile damage calculation)
  damage?: number; // Damage dealt (for hit event)
  targetPlayerId?: string; // Target player ID (for hit event)
  isBullet?: boolean; // Whether this is a bullet hit (for paralysis)
  paralysisDuration?: number; // Paralysis duration in ms (for bullet hit)
  paralyzedUntil?: number; // Timestamp when paralysis ends (for stats sync)
}

export interface OpponentInputCallback {
  (input: PlayerInput): void;
}

export interface RoomState {
  players: Map<string, any>;
  gameStarted: boolean;
  seed: number;
}

class ColyseusService {
  private client: Client | null = null;
  private room: Room<RoomState> | null = null;
  private inputCallback: OpponentInputCallback | null = null;
  private isConnected: boolean = false;

  constructor() {
    // Get Colyseus endpoint from environment or use default
    // Colyseus Cloud uses wss:// (WebSocket Secure)
    // IMPORTANT: Vite replaces import.meta.env.VITE_* at build time
    const endpoint = import.meta.env.VITE_COLYSEUS_ENDPOINT || 'ws://localhost:2567';
    
    // Log endpoint for debugging (without exposing full URL in production)
    console.log('🔍 Environment check:', {
      hasEnv: !!import.meta.env.VITE_COLYSEUS_ENDPOINT,
      endpoint: endpoint ? endpoint.substring(0, 30) + '...' : 'not set',
      allEnvKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
    });
    
    if (endpoint && endpoint !== 'ws://localhost:2567') {
      console.log('🔵 Colyseus endpoint found:', endpoint.substring(0, 30) + '...');
    } else {
      console.warn('⚠️ VITE_COLYSEUS_ENDPOINT not set, using default localhost');
    }
    
    // Convert https:// to wss:// if needed
    const wsEndpoint = endpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    
    try {
      this.client = new Client(wsEndpoint);
      console.log('✅ Colyseus client initialized:', wsEndpoint);
    } catch (error) {
      console.error('❌ Failed to initialize Colyseus client:', error);
    }
  }

  // Connect to Colyseus server
  async connect(endpoint?: string): Promise<boolean> {
    if (endpoint) {
      try {
        // Convert https:// to wss:// if needed
        const wsEndpoint = endpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
        this.client = new Client(wsEndpoint);
      } catch (error) {
        console.error('Failed to create Colyseus client:', error);
        return false;
      }
    }

    if (!this.client) {
      console.error('Colyseus client not initialized');
      return false;
    }

    return true;
  }

  // Join or create a PvP room
  async joinOrCreateRoom(address: string, onOpponentInput: OpponentInputCallback): Promise<Room<RoomState> | null> {
    if (!this.client) {
      console.error('Colyseus client not initialized');
      return null;
    }

    try {
      // Leave existing room if any
      if (this.room) {
        await this.leaveRoom();
      }

      // Join or create room
      this.room = await this.client.joinOrCreate<RoomState>("pvp_room", {
        address: address,
        x: 960,
        y: 540
      });

      this.inputCallback = onOpponentInput;
      this.isConnected = true;

      // Set up room message handlers
      this.setupRoomHandlers();

      console.log('Joined Colyseus room:', this.room.id);
      return this.room;
    } catch (error) {
      console.error('Failed to join Colyseus room:', error);
      return null;
    }
  }

  // Set up room message handlers
  private setupRoomHandlers(): void {
    if (!this.room) return;

    // Listen to player input from opponent
    this.room.onMessage("player_input", (message: PlayerInput) => {
      if (this.inputCallback) {
        this.inputCallback(message);
      }
    });

    // Listen to player joined
    this.room.onMessage("player_joined", (message: any) => {
      console.log('Player joined:', message);
    });

    // Listen to player left
    this.room.onMessage("player_left", (message: any) => {
      console.log('Player left:', message);
    });

    // Listen to match ready
    this.room.onMessage("match_ready", (message: any) => {
      console.log('Match ready:', message);
    });

    // Listen to game start
    this.room.onMessage("game_start", (message: any) => {
      console.log('Game started:', message);
    });

    // Listen to state changes
    this.room.onStateChange((state: RoomState) => {
      // Handle state changes if needed
    });

    // Listen to room errors
    this.room.onError((code: number, message?: string) => {
      console.error('Room error:', code, message || 'Unknown error');
    });

    // Listen to room leave
    this.room.onLeave((code: number) => {
      console.log('Left room:', code);
      this.isConnected = false;
      this.room = null;
    });
  }

  // Send player input to room
  sendInput(input: PlayerInput): boolean {
    if (!this.room || !this.isConnected) {
      return false;
    }

    try {
      this.room.send("player_input", input);
      return true;
    } catch (error) {
      console.error('Failed to send input:', error);
      return false;
    }
  }

  // Send player ready status
  sendReady(ready: boolean): boolean {
    if (!this.room || !this.isConnected) {
      return false;
    }

    try {
      this.room.send("player_ready", { ready });
      return true;
    } catch (error) {
      console.error('Failed to send ready:', error);
      return false;
    }
  }

  // Leave room
  async leaveRoom(): Promise<void> {
    if (this.room) {
      try {
        await this.room.leave();
      } catch (error) {
        console.error('Failed to leave room:', error);
      }
      this.room = null;
      this.isConnected = false;
    }
  }

  // Check if connected
  isConnectedToRoom(): boolean {
    return this.isConnected && this.room !== null;
  }

  // Get current room
  getRoom(): Room<RoomState> | null {
    return this.room;
  }

  // Get room state
  getState(): RoomState | null {
    return this.room?.state || null;
  }
}

// Export singleton instance
export const colyseusService = new ColyseusService();

