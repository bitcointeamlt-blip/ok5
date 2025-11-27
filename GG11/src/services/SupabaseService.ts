// Supabase Service for backend integration
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Profile {
  ronin_address: string;
  solo_data: {
    currency: number;
    dmg: number;
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

class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    try {
      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

      if (supabaseUrl && supabaseAnonKey) {
        this.client = createClient(supabaseUrl, supabaseAnonKey);
        console.log('Supabase client initialized successfully');
      } else {
        console.warn('Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file or Netlify environment variables');
      }
    } catch (error) {
      console.error('Error initializing Supabase service:', error);
    }
  }

  // Check if Supabase is configured
  isConfigured(): boolean {
    return this.client !== null;
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

  // Enter lobby
  async enterLobby(roninAddress: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('waiting_players')
        .upsert({
          ronin_address: roninAddress,
          joined_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error entering lobby:', error);
        return false;
      }

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
      const { error } = await this.client
        .from('matches')
        .delete()
        .or(`p1.eq.${roninAddress},p2.eq.${roninAddress}`)
        .in('state', ['waiting', 'ready', 'active']);

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
    if (!this.client) return false;

    try {
      // Get current match
      const { data: matchData, error: fetchError } = await this.client
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (fetchError || !matchData) {
        console.error('Error fetching match:', fetchError);
        return false;
      }

      const match = matchData as Match;
      const updateData: any = {};

      if (isPlayer1) {
        updateData.p1Ready = true;
      } else {
        updateData.p2Ready = true;
      }

      // If both players are ready, set state to 'active'
      const p1Ready = isPlayer1 ? true : (match.p1Ready || false);
      const p2Ready = isPlayer1 ? (match.p2Ready || false) : true;

      if (p1Ready && p2Ready) {
        updateData.state = 'active';
      } else {
        updateData.state = 'ready';
      }

      const { error } = await this.client
        .from('matches')
        .update(updateData)
        .eq('id', matchId);

      if (error) {
        console.error('Error setting player ready:', error);
        return false;
      }

      console.log('Player ready set', { matchId, roninAddress, isPlayer1, bothReady: p1Ready && p2Ready });
      return true;
    } catch (error) {
      console.error('Error in setPlayerReady:', error);
      return false;
    }
  }

  // Check if match is ready (both players ready)
  async checkMatchReady(matchId: string): Promise<{ ready: boolean; match: Match | null }> {
    if (!this.client) return { ready: false, match: null };

    try {
      const { data, error } = await this.client
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (error || !data) {
        return { ready: false, match: null };
      }

      const match = data as Match;
      const bothReady = match.p1Ready === true && match.p2Ready === true && match.state === 'active';

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
}

// Export singleton instance
export const supabaseService = new SupabaseService();

