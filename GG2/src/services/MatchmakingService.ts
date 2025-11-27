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

  // Enter lobby and wait for match
  async enterLobby(roninAddress: string, onMatchFound: MatchFoundCallback): Promise<boolean> {
    if (this.isInLobby) {
      console.warn('Already in lobby');
      return false;
    }

    try {
      // Enter lobby
      const success = await supabaseService.enterLobby(roninAddress);
      if (!success) {
        return false;
      }

      this.isInLobby = true;
      this.matchFoundCallback = onMatchFound;

      // Subscribe to waiting_players changes to detect match creation
      this.setupLobbyListener(roninAddress);

      // Check for existing matches (in case match was created before subscription)
      this.checkForMatch(roninAddress);

      return true;
    } catch (error) {
      console.error('Error entering lobby:', error);
      return false;
    }
  }

  // Leave lobby
  async leaveLobby(roninAddress: string): Promise<boolean> {
    if (!this.isInLobby) {
      return true;
    }

    try {
      // Unsubscribe from channels
      if (this.lobbyChannel) {
        await this.lobbyChannel.unsubscribe();
        this.lobbyChannel = null;
      }

      // Leave lobby
      const success = await supabaseService.leaveLobby(roninAddress);
      
      this.isInLobby = false;
      this.matchFoundCallback = null;

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
          if (match.state === 'waiting' || match.state === 'active') {
            this.handleMatchFound(match, roninAddress);
          }
        }
      )
      .subscribe();

    // Also listen to updates (in case match state changes)
    client
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
          if (match.state === 'active' && !this.currentMatch) {
            this.handleMatchFound(match, roninAddress);
          }
        }
      )
      .subscribe();
  }

  // Check if match already exists
  private async checkForMatch(roninAddress: string): Promise<void> {
    const client = supabaseService.getClient();
    if (!client) return;

    try {
      const { data, error } = await client
        .from('matches')
        .select('*')
        .or(`p1.eq.${roninAddress},p2.eq.${roninAddress}`)
        .in('state', ['waiting', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        this.handleMatchFound(data as Match, roninAddress);
      }
    } catch (error) {
      // No match found, continue waiting
    }
  }

  // Handle match found
  private handleMatchFound(match: Match, roninAddress: string): void {
    if (this.currentMatch && this.currentMatch.id === match.id) {
      return; // Already handling this match
    }

    this.currentMatch = match;
    const isPlayer1 = match.p1 === roninAddress;

    if (this.matchFoundCallback) {
      this.matchFoundCallback(match, isPlayer1);
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

