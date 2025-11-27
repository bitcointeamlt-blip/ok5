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
}

// Export singleton instance
export const supabaseService = new SupabaseService();

