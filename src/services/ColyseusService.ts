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
    // Get Colyseus endpoint from environment or use default based on environment
    // IMPORTANT: Vite replaces import.meta.env.VITE_* at build time
    // Check if production: Vite PROD mode OR hostname is not localhost
    const isProduction = import.meta.env.PROD || 
      (typeof window !== 'undefined' && 
       window.location.hostname !== 'localhost' && 
       window.location.hostname !== '127.0.0.1');
    
    // Default endpoints
    const defaultLocalEndpoint = 'ws://localhost:2567';
    
    // Use environment variable if set, otherwise use default based on environment
    let endpoint = import.meta.env.VITE_COLYSEUS_ENDPOINT;
    
    if (!endpoint) {
      if (isProduction) {
        // Production: Use Netlify Function proxy to avoid CORS issues
        // The proxy runs server-side, so no CORS problems
        const netlifyUrl = typeof window !== 'undefined' ? window.location.origin : '';
        endpoint = `${netlifyUrl}/.netlify/functions/colyseus-proxy`;
        console.log('🔵 Colyseus Service: Using Netlify Function proxy for production (CORS-free)');
        console.log('🔵 Proxy endpoint:', endpoint);
      } else {
        // Local: use localhost endpoint
        endpoint = defaultLocalEndpoint;
        console.log('🔵 Colyseus Service: Using default localhost endpoint for local development');
      }
    }
    
    // Log endpoint for debugging (without exposing full URL in production)
    console.log('🔍 Colyseus Service Environment:', {
      hasEnv: !!import.meta.env.VITE_COLYSEUS_ENDPOINT,
      endpoint: endpoint ? endpoint.substring(0, 50) + '...' : 'not set',
      isProduction: isProduction,
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
      allEnvKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
    });
    
    // Only create client if endpoint is available
    if (endpoint) {
      // Convert https:// to wss:// if needed
      const wsEndpoint = endpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
      
      try {
        this.client = new Client(wsEndpoint);
        console.log('✅ Colyseus client initialized with endpoint:', wsEndpoint.substring(0, 50) + '...');
      } catch (error) {
        console.error('❌ Failed to initialize Colyseus client:', error);
      }
    } else {
      console.warn('⚠️ Colyseus client not initialized - endpoint not configured');
    }
  }

  // Connect to Colyseus server
  async connect(endpoint?: string): Promise<boolean> {
    try {
      // If endpoint provided, create new client with that endpoint
      if (endpoint) {
        // Convert https:// to wss:// if needed
        const wsEndpoint = endpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
        console.log('🔵 Creating Colyseus client with endpoint:', wsEndpoint.substring(0, 50) + '...');
        this.client = new Client(wsEndpoint);
        console.log('✅ Colyseus client created successfully');
        return true;
      }

      // If no endpoint provided, use existing client from constructor
      if (!this.client) {
        const isProduction = import.meta.env.PROD || 
          (typeof window !== 'undefined' && 
           window.location.hostname !== 'localhost' && 
           window.location.hostname !== '127.0.0.1');
        
        if (isProduction) {
          console.error('❌ VITE_COLYSEUS_ENDPOINT not set in Netlify Environment Variables!');
          console.error('❌ Please set VITE_COLYSEUS_ENDPOINT in Netlify → Site settings → Environment variables');
        } else {
          console.error('❌ Colyseus client not initialized - endpoint not configured');
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Colyseus:', error);
      return false;
    }
  }

  // Custom matchmaking via HTTP proxy (for production to avoid CORS)
  private async joinOrCreateViaProxy(roomName: string, options: any): Promise<Room<RoomState> | null> {
    try {
      // Get proxy URL and Colyseus Cloud endpoint
      const netlifyUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const proxyUrl = `${netlifyUrl}/.netlify/functions/colyseus-proxy`;
      const colyseusCloudEndpoint = 'https://de-fra-f8820c12.colyseus.cloud';
      
      // Use proxy for HTTP matchmaking request
      const matchmakeUrl = `${proxyUrl}/matchmake/joinOrCreate/${roomName}`;
      console.log('🔵 Using proxy for matchmaking:', matchmakeUrl);

      const response = await fetch(matchmakeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Matchmaking failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const matchmakeData = await response.json();
      console.log('✅ Matchmaking response:', matchmakeData);

      // Colyseus matchmaking returns room data with roomId and sessionId
      // We need to create a Room object and connect via WebSocket
      const roomId = matchmakeData.roomId || matchmakeData.room?.roomId;
      const sessionId = matchmakeData.sessionId || matchmakeData.room?.sessionId;

      if (!roomId || !sessionId) {
        throw new Error('Failed to extract roomId or sessionId from matchmaking response');
      }

      console.log('🔵 Room ID:', roomId, 'Session ID:', sessionId);

      // Create new client with direct Colyseus Cloud WebSocket URL
      const wsEndpoint = colyseusCloudEndpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
      const directClient = new Client(wsEndpoint);
      
      // Join room using the room ID from matchmaking response
      // joinById connects via WebSocket directly (no CORS issues)
      const room = await directClient.joinById<RoomState>(roomId, options);

      return room;
    } catch (error: any) {
      console.error('❌ Proxy matchmaking failed:', error);
      console.error('❌ Error details:', {
        message: error?.message,
        stack: error?.stack,
      });
      return null;
    }
  }

  // Join or create a PvP room
  async joinOrCreateRoom(address: string, onOpponentInput: OpponentInputCallback): Promise<Room<RoomState> | null> {
    if (!this.client) {
      console.error('❌ Colyseus client not initialized');
      return null;
    }

    try {
      // Leave existing room if any
      if (this.room) {
        console.log('🔵 Leaving existing room before joining new one...');
        await this.leaveRoom();
      }

      console.log('🔵 Attempting to join or create room "pvp_room"...');
      console.log('🔵 Address:', address);
      
      const options = {
        address: address,
        x: 960,
        y: 540
      };

      // Check if we should use proxy method (production mode)
      const isProduction = import.meta.env.PROD || 
        (typeof window !== 'undefined' && 
         window.location.hostname !== 'localhost' && 
         window.location.hostname !== '127.0.0.1');

      // Try proxy method first in production to avoid CORS
      if (isProduction) {
        console.log('🔵 Production mode: Using proxy matchmaking method...');
        this.room = await this.joinOrCreateViaProxy("pvp_room", options);
        
        if (!this.room) {
          console.warn('⚠️ Proxy method failed, falling back to direct method');
          // Fallback to direct method
          const joinPromise = this.client.joinOrCreate<RoomState>("pvp_room", options);
          const timeoutPromise = new Promise<Room<RoomState>>((_, reject) => {
            setTimeout(() => reject(new Error('Join room timeout after 30 seconds')), 30000);
          });
          this.room = await Promise.race([joinPromise, timeoutPromise]);
        }
      } else {
        // Direct method for local development
        console.log('🔵 Local mode: Using direct matchmaking method...');
        const joinPromise = this.client.joinOrCreate<RoomState>("pvp_room", options);
        const timeoutPromise = new Promise<Room<RoomState>>((_, reject) => {
          setTimeout(() => reject(new Error('Join room timeout after 30 seconds')), 30000);
        });
        this.room = await Promise.race([joinPromise, timeoutPromise]);
      }

      if (!this.room) {
        console.error('❌ Room is null after joinOrCreate');
        return null;
      }

      this.inputCallback = onOpponentInput;
      this.isConnected = true;

      // Set up room message handlers
      this.setupRoomHandlers();

      console.log('✅ Successfully joined Colyseus room:', this.room.id);
      console.log('✅ Room state:', this.room.state);
      return this.room;
    } catch (error: any) {
      console.error('❌ Failed to join Colyseus room:', error);
      console.error('❌ Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code
      });
      
      // Check if it's a CORS error
      if (error?.message?.includes('CORS') || error?.message?.includes('Access-Control')) {
        console.error('❌ CORS ERROR DETECTED! Server is blocking requests from this origin.');
        console.error('❌ Please check Colyseus Cloud CORS settings or server CORS configuration.');
      }
      
      // Check if it's a network error
      if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
        console.error('❌ NETWORK ERROR! Cannot reach Colyseus server.');
        console.error('❌ Check if server is running and endpoint is correct.');
      }
      
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

