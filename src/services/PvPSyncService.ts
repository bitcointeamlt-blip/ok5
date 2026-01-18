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
    | 'healthpack_pickup'
    | 'tnt'
    | 'tnt_stick'
    | 'tnt_explode';
  timestamp: number;
  x?: number; // Click position or arrow/projectile start X or player position X or arrow/projectile current X
  y?: number; // Click position or arrow/projectile start Y or player position Y or arrow/projectile current Y
  vx?: number; // Player velocity X or arrow/projectile velocity X
  vy?: number; // Player velocity Y or arrow/projectile velocity Y
  targetX?: number; // Arrow/projectile target X
  targetY?: number; // Arrow/projectile target Y
  chargeTime?: number; // For projectiles
  isCrit?: boolean; // Whether this was a crit hit
  shooterId?: string; // Server-authoritative hit source
  angle?: number; // Arrow rotation angle
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
  // TNT specific properties
  isTnt?: boolean; // Whether this is a TNT hit
  fuseMs?: number; // TNT fuse time in ms (for tnt_stick event)
}

export interface OpponentInputCallback {
  (input: PlayerInput): void;
}

class PvPSyncService {
  private warned = false;

  private warnDisabled(): void {
    if (!this.warned) {
      console.warn('[PvPSyncService] Supabase realtime sync is disabled. Using Colyseus only.');
      this.warned = true;
    }
  }

  startSync(_matchId: string, _myAddress: string, _onOpponentInput: OpponentInputCallback): boolean {
    this.warnDisabled();
    return false;
  }

  stopSync(): void {
    /* no-op */
  }

  sendInput(_input: PlayerInput): boolean {
    return false;
  }

  isSyncing(): boolean {
    return false;
  }

  getCurrentMatchId(): string | null {
    return null;
  }
}

// Export singleton instance
export const pvpSyncService = new PvPSyncService();

