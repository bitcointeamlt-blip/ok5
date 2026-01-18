// Colyseus Service for PvP multiplayer
import { Client, Room } from "colyseus.js";

export interface PlayerInput {
  type:
    | 'click'
    | 'dash'
    | 'arrow'
    | 'projectile'
    | 'position'
    | 'arrow_position'
    | 'projectile_position'
    | 'line'
    | 'projectile_explode'
    | 'stats'
    | 'bullet'
    | 'hit'
    | 'mine'
    | 'healthpack'
    | 'healthpack_pickup';
  timestamp: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  targetX?: number;
  targetY?: number;
  chargeTime?: number;
  isCrit?: boolean;
  shooterId?: string; // Server-authoritative hit source
  angle?: number;
  points?: Array<{ x: number; y: number }>; // For drawn lines
  hp?: number; // Player HP (for stats sync)
  armor?: number; // Player Armor (for stats sync)
  maxHP?: number; // Player Max HP (for stats sync)
  maxArmor?: number; // Player Max Armor (for stats sync)
  dmg?: number; // Player damage stat (for arrow/projectile damage calculation)
  critChance?: number; // Crit chance % (for server-authoritative arrow hit)
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

export interface TurnShotPlan {
  tMs: number;
  type: 'arrow' | 'bullet' | 'projectile';
  aimX: number;
  aimY: number;
}

export interface TurnPlanSubmit {
  track: Array<{ tMs: number; x: number; y: number }>;
  spawns: Array<{ tMs: number; projType: 'arrow' | 'bullet' | 'projectile'; x: number; y: number; vx: number; vy: number }>;
  stats?: { dmg?: number; critChance?: number; fuel?: number; maxFuel?: number };
}

class ColyseusService {
  private client: Client | null = null;
  private room: Room<RoomState> | null = null;
  private roomName: string | null = null;
  private inputCallback: OpponentInputCallback | null = null;
  private isConnected: boolean = false;

  // #region agent log
  // Disable agent debug logging by default (it posts to localhost and can cause micro-stutters in production).
  private _agentEnabled: boolean = false;
  private _agentNetStats = {
    lastSentFlushTs: 0,
    lastRecvFlushTs: 0,
    sentCount: 0,
    sentBytes: 0,
    sentByType: {} as Record<string, number>,
    recvCount: 0,
    recvBytes: 0,
    recvByType: {} as Record<string, number>
  };
  private _agentStateStats = {
    lastFlushTs: 0,
    stateChangeCount: 0,
    playersSizeMax: 0,
    stateJsonBytesMax: 0
  };
  private _agentRtt = { lastMs: null as number | null, lastAt: 0 };
  private _agentSafeJsonSize(obj: any): number {
    try { return JSON.stringify(obj).length; } catch { return -1; }
  }
  private _agentPostLog(hypothesisId: string, location: string, message: string, data: any): void {
    if (!this._agentEnabled) return;
    const evt = { location, message, data, timestamp: Date.now(), sessionId: 'debug-session', runId: 'baseline', hypothesisId };
    // Always try local ingest (works for local dev / debugging).
    fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evt)}).catch(()=>{});
    // Fallback for HTTPS (Netlify) where mixed-content may block local ingest:
    // store a capped buffer in-memory so users can export it from DevTools.
    try {
      const w: any = (typeof window !== "undefined") ? window : {};
      const buf: any[] = w.__agentDebugBuffer || (w.__agentDebugBuffer = []);
      buf.push(evt);
      if (buf.length > 5000) buf.splice(0, buf.length - 5000);
      if (!w.__downloadAgentDebugLog) {
        w.__downloadAgentDebugLog = () => {
          try {
            const json = JSON.stringify(w.__agentDebugBuffer || []);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "agent-debug.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch {}
        };
      }
    } catch {}
  }
  private _agentPing = { lastPingTs: 0, pendingT0: null as number | null, pendingStartPerf: 0 };
  private _agentPerfNow(): number {
    try { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); } catch { return Date.now(); }
  }
  private _agentMaybePing(): void {
    try {
      if (!this._agentEnabled) return;
      if (!this.room || !this.isConnected) return;
      const now = Date.now();
      if (now - this._agentPing.lastPingTs < 2000) return;
      if (this._agentPing.pendingT0 !== null) return; // don't overlap pings
      const t0 = Math.floor(Math.random() * 1e9);
      this._agentPing.lastPingTs = now;
      this._agentPing.pendingT0 = t0;
      this._agentPing.pendingStartPerf = this._agentPerfNow();
      this.room.send("ping", { t0 });
    } catch {}
  }
  // #endregion

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
        // Production: VITE_COLYSEUS_ENDPOINT MUST be set in Netlify Environment Variables
        console.error('❌ VITE_COLYSEUS_ENDPOINT not set in Netlify Environment Variables!');
        console.error('❌ Please set VITE_COLYSEUS_ENDPOINT in Netlify → Site settings → Environment variables');
        // Don't throw error in constructor - let connect() handle it
        endpoint = null; // Will be checked in connect()
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
        
        // Store endpoint for logging
        (this as any)._currentEndpoint = wsEndpoint;
        
        this.client = new Client(wsEndpoint);
        console.log('✅ Colyseus client created successfully');
        console.log('✅ Client endpoint stored:', wsEndpoint.substring(0, 50) + '...');
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

  // Join or create a PvP room
  async joinOrCreateRoom(
    roomName: string,
    address: string,
    onOpponentInput: OpponentInputCallback,
    stats?: { hp?: number; maxHP?: number; armor?: number; maxArmor?: number; profilePicture?: string; ufoTicketTokenId?: string }
  ): Promise<Room<RoomState> | null> {
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

      console.log(`🔵 Attempting to join or create room "${roomName}"...`);
      // Log endpoint safely (Colyseus Client might not expose endpoint property)
      const clientEndpoint = (this as any)?._currentEndpoint || 
                           (this.client as any)?.endpoint || 
                           (this.client as any)?.transport?.endpoint || 
                           'unknown';
      console.log('🔵 Client endpoint:', clientEndpoint);
      console.log('🔵 Address:', address);
      
      // Join or create room with timeout (include stats to prevent 100/61 mismatches)
      const joinPromise = this.client.joinOrCreate<RoomState>(roomName, {
        address: address,
        x: 960,
        y: 540,
        hp: stats?.hp,
        maxHP: stats?.maxHP,
        armor: stats?.armor,
        maxArmor: stats?.maxArmor,
        profilePicture: stats?.profilePicture,
        // UFO ticket (SBT) gating (optional; server enforces if enabled)
        ufoTicketTokenId: stats?.ufoTicketTokenId
      });
      
      // Add timeout (30 seconds)
      const timeoutPromise = new Promise<Room<RoomState>>((_, reject) => {
        setTimeout(() => reject(new Error('Join room timeout after 30 seconds')), 30000);
      });
      
      this.room = await Promise.race([joinPromise, timeoutPromise]);

      if (!this.room) {
        console.error('❌ Room is null after joinOrCreate');
        return null;
      }
      this.roomName = roomName;

      this.inputCallback = onOpponentInput;
      this.isConnected = true;

      // Set up room message handlers
      this.setupRoomHandlers();

      console.log('✅ Successfully joined Colyseus room:', this.room.id);
      console.log('✅ Room state:', this.room.state);
      // #region agent log
      try {
        const clientEndpoint = (this as any)?._currentEndpoint ||
                             (this.client as any)?.endpoint ||
                             (this.client as any)?.transport?.endpoint ||
                             'unknown';
        if (this._agentEnabled) fetch('http://127.0.0.1:7242/ingest/b2c16d13-1eb7-4cea-94bc-55ab1f89cac0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/ColyseusService.ts:joinOrCreateRoom',message:'client joined room (mode debug)',data:{roomName,roomId:this.room.id,endpoint:clientEndpoint,addressPresent:!!address},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'E1'})}).catch(()=>{});
      } catch {}
      // #endregion
      // #region agent log
      try {
        const clientEndpoint = (this as any)?._currentEndpoint ||
                             (this.client as any)?.endpoint ||
                             (this.client as any)?.transport?.endpoint ||
                             'unknown';
        this._agentPostLog("H0","src/services/ColyseusService.ts:joinOrCreateRoom","joined room",{
          roomId: this.room.id,
          endpoint: typeof clientEndpoint === "string" ? clientEndpoint.substring(0, 80) : "unknown"
        });
      } catch {}
      // #endregion
      return this.room;
    } catch (error: any) {
      console.error('❌ Failed to join Colyseus room:', error);
      // Get endpoint safely
      const clientEndpoint = (this as any)?._currentEndpoint || 
                           (this.client as any)?.endpoint || 
                           (this.client as any)?.transport?.endpoint || 
                           'unknown';
      console.error('❌ Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
        endpoint: clientEndpoint
      });
      
      // Check if it's a CORS error
      if (error?.message?.includes('CORS') || 
          error?.message?.includes('Access-Control') ||
          error?.message?.includes('blocked by CORS policy') ||
          (error?.message?.includes('Failed to fetch') && error?.stack?.includes('CORS'))) {
        console.error('❌ CORS ERROR DETECTED!');
        console.error('❌ Serveris blokuoja request\'us iš:', window.location.origin);
        console.error('❌ Sprendimas: Colyseus Cloud → Deployments → Redeploy');
        console.error('❌ ARBA: Patikrinkite Colyseus Cloud CORS settings');
      }
      
      // Check if it's a network error
      if (error?.message?.includes('Failed to fetch') || 
          error?.message?.includes('NetworkError') ||
          error?.message?.includes('ERR_FAILED') ||
          error?.code === 'ECONNREFUSED') {
        const clientEndpoint = (this as any)?._currentEndpoint || 
                             (this.client as any)?.endpoint || 
                             (this.client as any)?.transport?.endpoint || 
                             'unknown';
        console.error('❌ NETWORK ERROR!');
        console.error('❌ Negaliu pasiekti Colyseus serverio:', clientEndpoint);
        console.error('❌ Patikrinkite: https://de-fra-f8820c12.colyseus.cloud/health');
      }
      
      // Check if it's a timeout
      if (error?.message?.includes('timeout')) {
        console.error('❌ TIMEOUT ERROR!');
        console.error('❌ Serveris neatsako per 30 sekundžių');
        console.error('❌ Patikrinkite ar serveris veikia');
      }
      
      return null;
    }
  }

  // Set up room message handlers
  private setupRoomHandlers(): void {
    if (!this.room) return;

    // Listen to player input from opponent
    this.room.onMessage("player_input", (message: PlayerInput) => {
      // #region agent log
      try {
        const now = Date.now();
        const type = (message as any)?.type ?? "unknown";
        this._agentNetStats.recvCount += 1;
        this._agentNetStats.recvBytes += this._agentSafeJsonSize(message);
        // Validate key to prevent prototype pollution
        if (type !== "__proto__" && type !== "constructor" && type !== "prototype") {
          this._agentNetStats.recvByType[type] = (this._agentNetStats.recvByType[type] || 0) + 1;
        }
        if (now - this._agentNetStats.lastRecvFlushTs >= 1000) {
          this._agentNetStats.lastRecvFlushTs = now;
          this._agentPostLog("H2","src/services/ColyseusService.ts:player_input:onMessage","client recv rate (1s window)",{
            recvCount:this._agentNetStats.recvCount,
            recvBytes:this._agentNetStats.recvBytes,
            recvByType:this._agentNetStats.recvByType,
            isConnected:this.isConnected,
            hasRoom:!!this.room
          });
          this._agentNetStats.recvCount = 0;
          this._agentNetStats.recvBytes = 0;
          this._agentNetStats.recvByType = {};
        }
      } catch {}
      // #endregion
      // #region agent log
      this._agentMaybePing();
      // #endregion
      if (this.inputCallback) {
        this.inputCallback(message);
      }
    });

    // #region agent log
    this.room.onMessage("pong", (message: any) => {
      try {
        const t0 = message?.t0;
        if (typeof t0 !== "number") return;
        if (this._agentPing.pendingT0 !== t0) return;
        const rttMs = Math.max(0, this._agentPerfNow() - this._agentPing.pendingStartPerf);
        this._agentRtt.lastMs = Math.round(rttMs * 10) / 10;
        this._agentRtt.lastAt = Date.now();
        this._agentPostLog("H8","src/services/ColyseusService.ts:pong","client<->server rtt",{
          rttMs: this._agentRtt.lastMs
        });
      } finally {
        this._agentPing.pendingT0 = null;
      }
    });
    // #endregion

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
      // #region agent log
      try {
        const now = Date.now();
        const stateJsonBytes = this._agentSafeJsonSize(state);
        const playersSize =
          (state as any)?.players?.size ??
          (typeof (state as any)?.players?.length === "number" ? (state as any).players.length : 0);
        this._agentStateStats.stateChangeCount += 1;
        this._agentStateStats.playersSizeMax = Math.max(this._agentStateStats.playersSizeMax, playersSize || 0);
        this._agentStateStats.stateJsonBytesMax = Math.max(this._agentStateStats.stateJsonBytesMax, stateJsonBytes || 0);
        if (now - this._agentStateStats.lastFlushTs >= 1000) {
          this._agentStateStats.lastFlushTs = now;
          this._agentPostLog("H4","src/services/ColyseusService.ts:onStateChange","client state patch rate (1s window)",{
            stateChangeCount:this._agentStateStats.stateChangeCount,
            playersSizeMax:this._agentStateStats.playersSizeMax,
            stateJsonBytesMax:this._agentStateStats.stateJsonBytesMax,
            isConnected:this.isConnected,
            hasRoom:!!this.room
          });
          this._agentStateStats.stateChangeCount = 0;
          this._agentStateStats.playersSizeMax = 0;
          this._agentStateStats.stateJsonBytesMax = 0;
        }
      } catch {}
      // #endregion

      // #region agent log
      this._agentMaybePing();
      // #endregion
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
    // NOTE: pvp_5sec_room now runs as live realtime gameplay (replay/turn loop removed).

    try {
      // #region agent log
      try {
        this._agentMaybePing();
        const now = Date.now();
        const type = (input as any)?.type ?? "unknown";
        this._agentNetStats.sentCount += 1;
        this._agentNetStats.sentBytes += this._agentSafeJsonSize(input);
        this._agentNetStats.sentByType[type] = (this._agentNetStats.sentByType[type] || 0) + 1;
        if (now - this._agentNetStats.lastSentFlushTs >= 1000) {
          this._agentNetStats.lastSentFlushTs = now;
          this._agentPostLog("H1","src/services/ColyseusService.ts:sendInput","client send rate (1s window)",{
            sentCount:this._agentNetStats.sentCount,
            sentBytes:this._agentNetStats.sentBytes,
            sentByType:this._agentNetStats.sentByType,
            isConnected:this.isConnected,
            hasRoom:!!this.room
          });
          this._agentNetStats.sentCount = 0;
          this._agentNetStats.sentBytes = 0;
          this._agentNetStats.sentByType = {};
        }
      } catch {}
      // #endregion
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

  // --- Turn-based PvP (micro-turn) API ---
  sendPlan(plan: TurnPlanSubmit): boolean {
    if (!this.room || !this.isConnected) return false;
    try {
      this.room.send("plan_submit", plan);
      return true;
    } catch (error) {
      console.error('Failed to send plan:', error);
      return false;
    }
  }

  lockPlan(): boolean {
    if (!this.room || !this.isConnected) return false;
    try {
      this.room.send("plan_lock", {});
      return true;
    } catch (error) {
      console.error('Failed to lock plan:', error);
      return false;
    }
  }

  // (attacker/defender API removed; 5SEC PvP uses plan_submit/round_execute)

  // Leave room
  async leaveRoom(): Promise<void> {
    const leavingRoom = this.room;
    if (leavingRoom) {
      try {
        await leavingRoom.leave();
      } catch (error) {
        console.error('Failed to leave room:', error);
      }
      // IMPORTANT: avoid races where an old leave() finishes after a new join() and nukes the new room.
      // Only clear if we're still pointing at the same room instance we started leaving.
      if (this.room === leavingRoom) {
        this.room = null;
        this.roomName = null;
        this.inputCallback = null;
        this.isConnected = false;
      }
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

  // #region agent log
  getAgentRttMs(): number | null {
    return this._agentRtt.lastMs;
  }
  getAgentRttAgeMs(): number {
    if (!this._agentRtt.lastAt) return Number.POSITIVE_INFINITY;
    return Math.max(0, Date.now() - this._agentRtt.lastAt);
  }
  // #endregion
}

// Export singleton instance
export const colyseusService = new ColyseusService();

