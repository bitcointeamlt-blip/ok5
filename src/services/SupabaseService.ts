// Supabase Service for backend integration
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Profile {
  ronin_address: string;
  nickname?: string; // Optional nickname field (may not exist in older DB schemas)
  solo_data: {
    currency: number;
    dmg: number;
    // Extended solo progression (stored in JSONB; no schema change needed)
    speedKmps?: number;
    distanceKm?: number;
    spins?: number;
    spinMilestones?: number;
    spinShards?: number;
    spinsGeneratedTotal?: number;
    savedAt?: number; // ms timestamp for conflict resolution
    level: number;
    maxUnlockedLevel: number;
    killsInCurrentLevel: number;
    upgrades: {
      critChance: number;
      critUpgradeLevel: number;
      accuracy: number;
      accuracyUpgradeLevel: number;
    };
    maxHP: number;
    maxArmor: number;
  };
  pvp_data: {
    elo: number;
    wins: number;
    losses: number;
    // Optional extra fields used by the game (JSONB can evolve without schema changes)
    maxHP?: number; // PvP max HP snapshot (may include NFT bonuses)
    maxHPUpdatedAt?: string; // ISO timestamp
    xp?: number; // Total XP snapshot (from local profile)
    xpUpdatedAt?: string; // ISO timestamp
    nickname?: string; // Public nickname snapshot (works even if `profiles.nickname` column doesn't exist)
    nicknameUpdatedAt?: string; // ISO timestamp
  };
  created_at?: string;
  updated_at?: string;
}

export interface Match {
  id: string;
  p1: string; // ronin_address
  p2: string; // ronin_address
  state: 'waiting' | 'ready' | 'active' | 'done';
  seed: number;
  winner: string | null;
  p1Ready: boolean | null;
  p2Ready: boolean | null;
  created_at: string;
}

export interface LeaderboardEntry {
  ronin_address: string;
  nickname?: string;
  wins: number;
  losses: number;
  elo: number;
  maxHP: number; // prefer pvp_data.maxHP if present; fallback to solo_data.maxHP
  xp: number; // prefer pvp_data.xp; fallback 0
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private debug: { configured: boolean; urlHost: string | null } = { configured: false, urlHost: null };

  constructor() {
    try {
      // Vite injects VITE_* at build time
      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.VITE_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

      if (supabaseUrl && supabaseAnonKey) {
        // OPTIMIZED: Enable Realtime with WebSocket for low-latency PvP
        // Reduced eventsPerSecond from 20 to 10 to prevent network lag
        this.client = createClient(supabaseUrl, supabaseAnonKey, {
          realtime: {
            params: {
              eventsPerSecond: 10, // Reduced from 20 to 10 to match our sync rate and prevent lag
            },
          },
        });
        console.log('Supabase client initialized with Realtime (WebSocket) support');
        this.debug.configured = true;
        try {
          this.debug.urlHost = new URL(supabaseUrl).host;
        } catch {
          this.debug.urlHost = supabaseUrl ? supabaseUrl.substring(0, 48) : null;
        }
      } else {
        console.warn('Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file or Netlify environment variables');
        this.debug.configured = false;
        this.debug.urlHost = null;
      }
    } catch (error) {
      console.error('Error initializing Supabase service:', error);
      this.debug.configured = false;
      this.debug.urlHost = null;
    }
  }

  // Check if Supabase is configured
  isConfigured(): boolean {
    return this.client !== null;
  }

  getDebugInfo(): { configured: boolean; urlHost: string | null } {
    return { ...this.debug };
  }

  // Authenticate with Ronin signature
  async loginWithRonin(address: string, signature: string): Promise<{ success: boolean; error?: string }> {
    if (!this.client) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      // Call Edge Function for authentication
      const { data, error } = await this.client.functions.invoke('login_with_ronin', {
        body: { address, signature },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Get or create profile
  async getProfile(roninAddress: string): Promise<Profile | null> {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('ronin_address', roninAddress)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, create it
          return await this.createProfile(roninAddress);
        }
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as Profile;
    } catch (error) {
      console.error('Error in getProfile:', error);
      return null;
    }
  }

  // Create new profile
  async createProfile(roninAddress: string): Promise<Profile | null> {
    if (!this.client) return null;

    try {
      const newProfile: Profile = {
        ronin_address: roninAddress,
        solo_data: {
          currency: 1000,
          dmg: 1,
          speedKmps: 1,
          distanceKm: 0,
          spins: 0,
          spinMilestones: 0,
          spinShards: 0,
          spinsGeneratedTotal: 0,
          savedAt: Date.now(),
          level: 1,
          maxUnlockedLevel: 1,
          killsInCurrentLevel: 0,
          upgrades: {
            critChance: 4,
            critUpgradeLevel: 0,
            accuracy: 60,
            accuracyUpgradeLevel: 0,
          },
          maxHP: 10,
          maxArmor: 5,
        },
        pvp_data: {
          elo: 1000, // Starting ELO
          wins: 0,
          losses: 0,
        },
      };

      const { data, error } = await this.client
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();

      if (error) {
        console.error('Error creating profile:', error);
        return null;
      }

      return data as Profile;
    } catch (error) {
      console.error('Error in createProfile:', error);
      return null;
    }
  }

  // Update solo data
  async updateSoloData(roninAddress: string, soloData: Profile['solo_data']): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('profiles')
        .update({
          solo_data: soloData,
          updated_at: new Date().toISOString(),
        })
        .eq('ronin_address', roninAddress);

      if (error) {
        console.error('Error updating solo data:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in updateSoloData:', error);
      return false;
    }
  }

  // Update solo snapshot fields without overwriting unknown solo_data keys (JSONB merge).
  async updateSoloSnapshot(
    roninAddress: string,
    snapshot: Partial<Profile['solo_data']> & { savedAt?: number }
  ): Promise<boolean> {
    if (!this.client) return false;
    try {
      const { data: row, error: fetchError } = await this.client
        .from('profiles')
        .select('solo_data')
        .eq('ronin_address', roninAddress)
        .single();

      if (fetchError) {
        console.error('Error fetching solo_data for updateSoloSnapshot:', fetchError);
        return false;
      }

      const current: any = (row as any)?.solo_data && typeof (row as any).solo_data === 'object' ? (row as any).solo_data : {};
      const merged: any = { ...current, ...snapshot };
      if (typeof merged.savedAt !== 'number' || !Number.isFinite(merged.savedAt)) {
        merged.savedAt = Date.now();
      }

      const { error } = await this.client
        .from('profiles')
        .update({
          solo_data: merged,
          updated_at: new Date().toISOString(),
        })
        .eq('ronin_address', roninAddress);

      if (error) {
        console.error('Error updating solo snapshot:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error in updateSoloSnapshot:', error);
      return false;
    }
  }

  // Update PvP data
  async updatePvpData(roninAddress: string, pvpData: Profile['pvp_data']): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('profiles')
        .update({
          pvp_data: pvpData,
          updated_at: new Date().toISOString(),
        })
        .eq('ronin_address', roninAddress);

      if (error) {
        console.error('Error updating PvP data:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in updatePvpData:', error);
      return false;
    }
  }

  // Update PvP snapshot fields without overwriting existing pvp_data keys (wins/losses/elo).
  async updatePvpSnapshot(roninAddress: string, snapshot: { maxHP?: number; xp?: number; nickname?: string }): Promise<boolean> {
    if (!this.client) return false;
    try {
      const hp =
        (typeof snapshot?.maxHP === 'number' && Number.isFinite(snapshot.maxHP))
          ? Math.max(1, Math.round(snapshot.maxHP))
          : undefined;
      const xp =
        (typeof snapshot?.xp === 'number' && Number.isFinite(snapshot.xp))
          ? Math.max(0, Math.round(snapshot.xp))
          : undefined;
      const nickname =
        (typeof snapshot?.nickname === 'string' && snapshot.nickname.trim().length)
          ? snapshot.nickname.trim().substring(0, 16)
          : undefined;

      // Fetch existing pvp_data first to avoid wiping fields.
      const { data: row, error: fetchError } = await this.client
        .from('profiles')
        .select('pvp_data')
        .eq('ronin_address', roninAddress)
        .single();

      if (fetchError) {
        console.error('Error fetching pvp_data for updatePvpSnapshot:', fetchError);
        return false;
      }

      const current: any = (row as any)?.pvp_data && typeof (row as any).pvp_data === 'object' ? (row as any).pvp_data : {};
      const merged: any = {
        ...current,
      };
      const nowIso = new Date().toISOString();
      if (typeof hp === 'number') {
        merged.maxHP = hp;
        merged.maxHPUpdatedAt = nowIso;
      }
      if (typeof xp === 'number') {
        merged.xp = xp;
        merged.xpUpdatedAt = nowIso;
      }
      if (typeof nickname === 'string') {
        merged.nickname = nickname;
        merged.nicknameUpdatedAt = nowIso;
      }

      const { error: updateError } = await this.client
        .from('profiles')
        .update({
          pvp_data: merged,
          updated_at: new Date().toISOString(),
        })
        .eq('ronin_address', roninAddress);

      if (updateError) {
        console.error('Error updating pvp snapshot:', updateError);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Error in updatePvpSnapshot:', e);
      return false;
    }
  }

  // Update nickname
  async updateNickname(roninAddress: string, nickname: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('profiles')
        .update({
          nickname: nickname,
          updated_at: new Date().toISOString(),
        })
        .eq('ronin_address', roninAddress);

      if (error) {
        console.error('Error updating nickname:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in updateNickname:', error);
      return false;
    }
  }

  // Leaderboard
  // NOTE: We keep this simple and fetch a bounded set, then clients can sort/paginate locally.
  // This avoids relying on JSON field ordering/casting behavior across PostgREST versions.
  async fetchLeaderboardEntries(limit: number = 500): Promise<LeaderboardEntry[]> {
    if (!this.client) return [];
    try {
      const safeLimit = Math.max(1, Math.min(2000, Math.floor(limit)));
      // Some older DB schemas may not have `nickname` column. Try with nickname first,
      // and if PostgREST complains, retry without it (leaderboard will show addresses).
      let data: any = null;
      let error: any = null;
      {
        const res = await this.client
          .from('profiles')
          .select('ronin_address,nickname,pvp_data,solo_data')
          .limit(safeLimit);
        data = res.data;
        error = res.error;
      }
      if (error && typeof error?.message === 'string' && error.message.includes('profiles.nickname') && error.message.includes('does not exist')) {
        const res2 = await this.client
          .from('profiles')
          .select('ronin_address,pvp_data,solo_data')
          .limit(safeLimit);
        data = res2.data;
        error = res2.error;
      }

      if (error) {
        // IMPORTANT: bubble up so UI can show the real reason (often RLS / permission denied)
        throw new Error(error.message || 'Supabase error');
      }

      const rows: any[] = Array.isArray(data) ? data : [];
      return rows.map((r) => ({
        ronin_address: String(r?.ronin_address || ''),
        // Prefer real column if it exists; fallback to JSONB snapshot in pvp_data.
        nickname: (typeof r?.nickname === 'string' ? r.nickname : (typeof r?.pvp_data?.nickname === 'string' ? r.pvp_data.nickname : undefined)),
        wins: Number(r?.pvp_data?.wins ?? 0) || 0,
        losses: Number(r?.pvp_data?.losses ?? 0) || 0,
        elo: Number(r?.pvp_data?.elo ?? 1000) || 1000,
        maxHP: Number(r?.pvp_data?.maxHP ?? r?.solo_data?.maxHP ?? 10) || 10,
        xp: Number(r?.pvp_data?.xp ?? 0) || 0,
      })).filter((x) => !!x.ronin_address);
    } catch (e) {
      console.error('Error in fetchLeaderboardEntries:', e);
      throw e;
    }
  }

  // Enter lobby
  async enterLobby(roninAddress: string): Promise<boolean> {
    if (!this.client) {
      console.error('Cannot enter lobby: Supabase client is null');
      return false;
    }

    try {
      console.log('Entering lobby for:', roninAddress);
      
      // First, try to delete existing entry (if any) to avoid conflicts
      const { error: deleteError } = await this.client
        .from('waiting_players')
        .delete()
        .eq('ronin_address', roninAddress);
      
      if (deleteError) {
        console.warn('Warning deleting old waiting_players entry:', deleteError);
      }
      
      // Check how many players are currently waiting
      const { data: waitingCount, error: countError } = await this.client
        .from('waiting_players')
        .select('ronin_address', { count: 'exact' });
      
      console.log('Current waiting players count:', waitingCount?.length || 0);
      
      // Then insert new entry
      const { data: insertData, error } = await this.client
        .from('waiting_players')
        .insert({
          ronin_address: roninAddress,
          joined_at: new Date().toISOString(),
        })
        .select();

      if (error) {
        console.error('Error entering lobby:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return false;
      }

      console.log('Successfully entered lobby:', roninAddress, 'Insert result:', insertData);
      
      // Wait a moment and check if match was created
      setTimeout(async () => {
        const { data: matches, error: matchError } = await this.client!
          .from('matches')
          .select('*')
          .or(`p1.eq.${roninAddress},p2.eq.${roninAddress}`)
          .in('state', ['waiting', 'ready', 'active'])
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (matchError) {
          console.error('Error checking for match after entering lobby:', matchError);
        } else {
          console.log('Matches found after entering lobby:', matches);
        }
      }, 2000);

      return true;
    } catch (error) {
      console.error('Error in enterLobby:', error);
      return false;
    }
  }

  // Leave lobby
  async leaveLobby(roninAddress: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('waiting_players')
        .delete()
        .eq('ronin_address', roninAddress);

      if (error) {
        console.error('Error leaving lobby:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in leaveLobby:', error);
      return false;
    }
  }

  // Clear old matches for a player
  async clearOldMatches(roninAddress: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      // Delete old waiting/active matches for this player
      // Use separate queries to avoid 406 error with .or() filter
      const { error: error1 } = await this.client
        .from('matches')
        .delete()
        .eq('p1', roninAddress)
        .in('state', ['waiting', 'ready', 'active']);
      
      const { error: error2 } = await this.client
        .from('matches')
        .delete()
        .eq('p2', roninAddress)
        .in('state', ['waiting', 'ready', 'active']);
      
      const error = error1 || error2;

      if (error) {
        console.error('Error clearing old matches:', error);
        return false;
      }

      console.log('Cleared old matches for', roninAddress);
      return true;
    } catch (error) {
      console.error('Error in clearOldMatches:', error);
      return false;
    }
  }

  // Set player ready status
  async setPlayerReady(matchId: string, roninAddress: string, isPlayer1: boolean): Promise<boolean> {
    if (!this.client) {
      console.error('Cannot set player ready: Supabase client is null');
      return false;
    }

    try {
      console.log('setPlayerReady called:', { matchId, roninAddress, isPlayer1 });
      
      // Get current match
      // Use select('*') to get all columns including p1Ready and p2Ready
      const { data: matchData, error: fetchError } = await this.client
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (fetchError) {
        console.error('Error fetching match:', fetchError);
        console.error('Error details:', JSON.stringify(fetchError, null, 2));
        return false;
      }

      if (!matchData) {
        console.error('Match not found:', matchId);
        return false;
      }

      const match = matchData as Match;
      console.log('Current match state:', { 
        p1Ready: match.p1Ready, 
        p2Ready: match.p2Ready, 
        state: match.state 
      });

      const updateData: any = {};

      if (isPlayer1) {
        updateData.p1Ready = true;
      } else {
        updateData.p2Ready = true;
      }

      // If both players are ready, set state to 'active'
      const p1Ready = isPlayer1 ? true : (match.p1Ready === true);
      const p2Ready = isPlayer1 ? (match.p2Ready === true) : true;

      if (p1Ready && p2Ready) {
        updateData.state = 'active';
        console.log('Both players ready! Setting match state to active');
      } else {
        updateData.state = 'ready';
        console.log('One player ready, setting match state to ready', { p1Ready, p2Ready });
      }

      console.log('Updating match with:', updateData);
      console.log('Match ID:', matchId);
      console.log('Update query will be:', {
        table: 'matches',
        match: { id: matchId },
        update: updateData
      });

      const { data: updateResult, error } = await this.client
        .from('matches')
        .update(updateData)
        .eq('id', matchId)
        .select('*');

      if (error) {
        console.error('Error setting player ready:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return false;
      }

      console.log('Player ready set successfully!', { 
        matchId, 
        roninAddress, 
        isPlayer1, 
        bothReady: p1Ready && p2Ready,
        updatedMatch: updateResult 
      });
      return true;
    } catch (error) {
      console.error('Error in setPlayerReady:', error);
      console.error('Error stack:', (error as Error).stack);
      return false;
    }
  }

  // Check if match is ready (both players ready)
  async checkMatchReady(matchId: string): Promise<{ ready: boolean; match: Match | null }> {
    if (!this.client) return { ready: false, match: null };

    try {
      // Use select('*') to get all columns including p1Ready and p2Ready
      const { data, error } = await this.client
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (error) {
        console.error('Error fetching match in checkMatchReady:', error);
        return { ready: false, match: null };
      }

      if (!data) {
        console.error('No match data returned in checkMatchReady');
        return { ready: false, match: null };
      }

      const match = data as Match;
      console.log('checkMatchReady - Match data:', match);
      console.log('checkMatchReady - Ready states:', { 
        p1Ready: match.p1Ready, 
        p2Ready: match.p2Ready, 
        p1ReadyType: typeof match.p1Ready,
        p2ReadyType: typeof match.p2Ready,
        state: match.state 
      });
      
      // CRITICAL FIX: Check if both players are ready - state can be 'ready' or 'active'
      // If both are ready, the game should start regardless of state
      const bothReady = match.p1Ready === true && match.p2Ready === true && (match.state === 'ready' || match.state === 'active');
      console.log('checkMatchReady - bothReady:', bothReady, {
        p1Ready: match.p1Ready,
        p2Ready: match.p2Ready,
        state: match.state,
        condition: `${match.p1Ready === true} && ${match.p2Ready === true} && (${match.state === 'ready'} || ${match.state === 'active'})`
      });

      return { ready: bothReady, match };
    } catch (error) {
      console.error('Error checking match ready:', error);
      return { ready: false, match: null };
    }
  }

  // Get match by ID
  async getMatch(matchId: string): Promise<Match | null> {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (error) {
        console.error('Error fetching match:', error);
        return null;
      }

      return data as Match;
    } catch (error) {
      console.error('Error in getMatch:', error);
      return null;
    }
  }

  // Update match result
  async updateMatchResult(matchId: string, winner: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('matches')
        .update({
          state: 'done',
          winner: winner,
        })
        .eq('id', matchId);

      if (error) {
        console.error('Error updating match result:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in updateMatchResult:', error);
      return false;
    }
  }

  // Get Supabase client for Realtime subscriptions
  getClient(): SupabaseClient | null {
    return this.client;
  }

  // --- Auth helpers (Email / OAuth providers like Discord/X) ---
  async signInWithEmailMagicLink(email: string, redirectTo: string): Promise<{ success: boolean; error?: string }> {
    if (!this.client) return { success: false, error: 'Supabase not configured' };
    try {
      const { error } = await this.client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Auth error' };
    }
  }

  async signOutAuth(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.auth.signOut();
    } catch {
      // ignore
    }
  }

  async getAuthSession(): Promise<{ userId: string | null; email: string | null }> {
    if (!this.client) return { userId: null, email: null };
    try {
      const { data } = await this.client.auth.getSession();
      const user = data?.session?.user || null;
      return { userId: user?.id || null, email: (user as any)?.email || null };
    } catch {
      return { userId: null, email: null };
    }
  }

  onAuthStateChange(cb: (userId: string | null, email: string | null) => void): (() => void) | null {
    if (!this.client) return null;
    try {
      const { data } = this.client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user || null;
        cb(user?.id || null, (user as any)?.email || null);
      });
      return () => data.subscription.unsubscribe();
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const supabaseService = new SupabaseService();

