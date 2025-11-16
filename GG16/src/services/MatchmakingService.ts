// Matchmaking Service for PvP lobby and match creation
import { supabaseService } from './SupabaseService';
import type { Match } from './SupabaseService';

export interface MatchFoundCallback {
  (match: Match, isPlayer1: boolean): void;
}

class MatchmakingService {
  private isInLobby: boolean = false;
  private currentMatch: Match | null = null;
  private matchFoundCallback: MatchFoundCallback | null = null;
  private realtimeChannel: any = null;
  private lobbyChannel: any = null;
  private lobbyUpdatesChannel: any = null; // Track second lobby channel

  // Enter lobby and wait for match
  async enterLobby(roninAddress: string, onMatchFound: MatchFoundCallback): Promise<boolean> {
    // CRITICAL: Log the address being used
    console.log('🔵 MatchmakingService.enterLobby() called with address:', {
      roninAddress,
      addressLength: roninAddress?.length,
      addressType: typeof roninAddress,
      isInLobby: this.isInLobby
    });
    
    if (this.isInLobby) {
      console.warn('⚠️ Already in lobby, skipping...');
      return false;
    }

    try {
      console.log('🔵 Entering lobby...', { roninAddress });
      
      // Enter lobby
      const success = await supabaseService.enterLobby(roninAddress);
      if (!success) {
        console.error('❌ Failed to enter lobby via SupabaseService');
        return false;
      }

      console.log('✅ Successfully entered lobby, setting up listeners for address:', roninAddress);
      this.isInLobby = true;
      this.matchFoundCallback = onMatchFound;

      // Subscribe to waiting_players changes to detect match creation
      console.log('🔵 Setting up lobby listener for address:', roninAddress);
      this.setupLobbyListener(roninAddress);

      // Check for existing matches (in case match was created before subscription)
      // Wait a bit before checking to ensure subscription is set up
      setTimeout(() => {
        console.log('🔵 Checking for existing match for address:', roninAddress);
        this.checkForMatch(roninAddress);
      }, 500);
      
      // Also set up periodic polling as backup (every 3 seconds - reduced frequency)
      // This ensures we catch matches even if real-time subscription fails
      const pollInterval = setInterval(() => {
        if (!this.isInLobby) {
          clearInterval(pollInterval);
          return;
        }
        if (this.currentMatch) {
          clearInterval(pollInterval);
          return;
        }
        // Removed console.log to reduce lag
        this.checkForMatch(roninAddress);
      }, 3000); // Increased from 2000ms to 3000ms to reduce load
      
      // Store interval ID for cleanup
      (window as any)[`matchPollInterval_${roninAddress}`] = pollInterval;

      return true;
    } catch (error) {
      console.error('❌ Error entering lobby:', error);
      this.isInLobby = false;
      return false;
    }
  }

  // Leave lobby
  async leaveLobby(roninAddress: string): Promise<boolean> {
    if (!this.isInLobby) {
      return true;
    }

    try {
      // Clear polling interval if exists
      const pollInterval = (window as any)[`matchPollInterval_${roninAddress}`];
      if (pollInterval) {
        clearInterval(pollInterval);
        delete (window as any)[`matchPollInterval_${roninAddress}`];
        console.log('🔵 Cleared polling interval for:', roninAddress);
      }
      
      // Unsubscribe from channels
      if (this.lobbyChannel) {
        await this.lobbyChannel.unsubscribe();
        this.lobbyChannel = null;
      }
      
      if (this.lobbyUpdatesChannel) {
        await this.lobbyUpdatesChannel.unsubscribe();
        this.lobbyUpdatesChannel = null;
      }

      // Leave lobby
      const success = await supabaseService.leaveLobby(roninAddress);
      
      this.isInLobby = false;
      this.matchFoundCallback = null;
      this.currentMatch = null;

      return success;
    } catch (error) {
      console.error('Error leaving lobby:', error);
      return false;
    }
  }

  // Setup listener for match creation
  private setupLobbyListener(roninAddress: string): void {
    const client = supabaseService.getClient();
    if (!client) return;

    // CRITICAL: Prevent duplicate lobby channels (HMR protection)
    if (this.lobbyChannel || this.lobbyUpdatesChannel) {
      console.warn('⚠️ Lobby channels already exist, skipping duplicate setup:', roninAddress);
      return;
    }

    // Listen to matches table for new matches where this player is p1 or p2
    this.lobbyChannel = client
      .channel(`lobby_${roninAddress}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: `or(p1.eq.${roninAddress},p2.eq.${roninAddress})`,
        },
        (payload: any) => {
          const match = payload.new as Match;
          // Removed console.log to reduce lag
          
          // Check if this match is for me
          const isForMe = match.p1 === roninAddress || match.p2 === roninAddress;
          if (!isForMe) {
            // Removed console.log to reduce lag
            return;
          }
          
          // Handle match found for waiting, ready, or active states
          if (match.state === 'waiting' || match.state === 'ready' || match.state === 'active') {
            // Only handle if match is in waiting or ready state (not active yet, unless both ready)
            if (match.state === 'waiting' || match.state === 'ready' || 
                (match.state === 'active' && match.p1Ready === true && match.p2Ready === true)) {
              // Removed console.log to reduce lag
              this.handleMatchFound(match, roninAddress);
            } else {
              // Removed console.log to reduce lag
            }
          }
        }
      )
      .subscribe((status: string) => {
        console.log('🔵 Match INSERT subscription status:', status, { roninAddress });
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to match INSERT events for:', roninAddress);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to match INSERT events for:', roninAddress);
        }
      });

    // Also listen to updates (in case match state changes)
    this.lobbyUpdatesChannel = client
      .channel(`lobby_updates_${roninAddress}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `or(p1.eq.${roninAddress},p2.eq.${roninAddress})`,
        },
        (payload: any) => {
          const match = payload.new as Match;
          // Removed console.log to reduce lag
          // Handle match found for waiting or ready states (not active yet)
          if ((match.state === 'waiting' || match.state === 'ready') && !this.currentMatch) {
            this.handleMatchFound(match, roninAddress);
          }
        }
      )
      .subscribe((status: string) => {
        console.log('🔵 Match UPDATE subscription status:', status, { roninAddress });
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to match UPDATE events for:', roninAddress);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to match UPDATE events for:', roninAddress);
        }
      });
  }

  // Check if match already exists
  private async checkForMatch(roninAddress: string): Promise<void> {
    const client = supabaseService.getClient();
    if (!client) {
      console.error('❌ Cannot check for match: Supabase client is null');
      return;
    }

    try {
      // Removed console.log to reduce lag
      
      // Use separate queries to avoid 406 error with .or() filter
      // Use select('*') to get all columns including p1Ready and p2Ready
      const { data: data1, error: error1 } = await client
        .from('matches')
        .select('*')
        .eq('p1', roninAddress)
        .in('state', ['waiting', 'ready', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error1) {
        console.error('❌ Error checking for match as p1:', error1);
      } else {
        // Removed console.log to reduce lag
      }
      
      const { data: data2, error: error2 } = await client
        .from('matches')
        .select('*')
        .eq('p2', roninAddress)
        .in('state', ['waiting', 'ready', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error2) {
        console.error('❌ Error checking for match as p2:', error2);
      } else {
        // Removed console.log to reduce lag
      }
      
      // Use the most recent match
      let data = null;
      if (data1 && data2) {
        data = new Date(data1.created_at) > new Date(data2.created_at) ? data1 : data2;
        // Removed console.log to reduce lag
      } else if (data1) {
        data = data1;
        // Removed console.log to reduce lag
      } else if (data2) {
        data = data2;
        // Removed console.log to reduce lag
      }
      
      const error = error1 || error2;

      if (error) {
        console.error('❌ Error in checkForMatch:', error);
      } else if (data) {
        console.log('✅ Match found via checkForMatch!', {
          matchId: data.id,
          p1: data.p1,
          p2: data.p2,
          state: data.state,
          myAddress: roninAddress
        });
        this.handleMatchFound(data as Match, roninAddress);
      } else {
        // Removed console.log to reduce lag
      }
    } catch (error) {
      console.error('❌ Exception in checkForMatch:', error);
      // Continue waiting, but log the error
    }
  }

  // Handle match found
  private handleMatchFound(match: Match, roninAddress: string): void {
    if (this.currentMatch && this.currentMatch.id === match.id) {
      console.log('Already handling this match, skipping...', { matchId: match.id });
      return; // Already handling this match
    }

    console.log('Handling match found:', { 
      matchId: match.id, 
      roninAddress, 
      p1: match.p1, 
      p2: match.p2,
      state: match.state,
      p1Ready: match.p1Ready,
      p2Ready: match.p2Ready
    });

    // CRITICAL: Close lobby channels to free up Supabase connections
    // This prevents hitting Supabase rate limits
    if (this.lobbyChannel) {
      this.lobbyChannel.unsubscribe().catch((err: any) => {
        console.warn('Error unsubscribing from lobby channel:', err);
      });
      this.lobbyChannel = null;
    }
    
    if (this.lobbyUpdatesChannel) {
      this.lobbyUpdatesChannel.unsubscribe().catch((err: any) => {
        console.warn('Error unsubscribing from lobby updates channel:', err);
      });
      this.lobbyUpdatesChannel = null;
    }

    this.currentMatch = match;
    this.isInLobby = false; // No longer in lobby
    const isPlayer1 = match.p1 === roninAddress;

    if (this.matchFoundCallback) {
      console.log('Calling match found callback...', { isPlayer1 });
      this.matchFoundCallback(match, isPlayer1);
    } else {
      console.error('No match found callback registered!');
    }
  }

  // Get current match
  getCurrentMatch(): Match | null {
    return this.currentMatch;
  }

  // Clear current match
  clearMatch(): void {
    this.currentMatch = null;
  }

  // Check if in lobby
  isInLobbyCheck(): boolean {
    return this.isInLobby;
  }
}

// Export singleton instance
export const matchmakingService = new MatchmakingService();

