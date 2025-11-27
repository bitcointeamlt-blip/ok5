// Wallet Service for Ronin Wallet integration
// Ronin Wallet uses window.ronin object when extension is installed

export interface WalletState {
  isConnected: boolean;
  address: string | null;
}

interface RoninProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  isRonin?: boolean;
  on?: (event: string, callback: (...args: any[]) => void) => void;
  removeListener?: (event: string, callback: (...args: any[]) => void) => void;
}

class WalletService {
  private state: WalletState = {
    isConnected: false,
    address: null,
  };

  private listeners: Array<(state: WalletState) => void> = [];
  private provider: RoninProvider | null = null;

  constructor() {
    // Check if Ronin wallet is installed
    // Ronin Wallet exposes window.ronin.provider (EIP-1193 compatible)
    if (typeof window !== 'undefined') {
      const ronin = (window as any).ronin;
      if (ronin && ronin.provider) {
        this.provider = ronin.provider;
      } else if (ronin && typeof ronin.request === 'function') {
        // Fallback: if ronin itself has request method
        this.provider = ronin;
      }
    }
  }

  // Check if Ronin wallet is available
  isWalletAvailable(): boolean {
    return this.provider !== null;
  }

  // Connect to Ronin Wallet
  async connect(): Promise<{ address: string; signature: string } | null> {
    try {
      if (!this.provider) {
        throw new Error('Ronin Wallet not installed. Please install the Ronin Wallet extension.');
      }

      // Request connection
      const accounts = await this.provider.request({
        method: 'eth_requestAccounts',
      });
      
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from wallet');
      }

      const address = accounts[0];
      
      // Sign message for authentication
      const message = 'Login to DOT Arena';
      const signature = await this.provider.request({
        method: 'personal_sign',
        params: [message, address],
      });

      this.state.isConnected = true;
      this.state.address = address;
      
      // Store in localStorage
      localStorage.setItem('ronin_address', address);
      localStorage.setItem('ronin_signature', signature);
      localStorage.setItem('ronin_message', message);

      this.notifyListeners();
      
      return { address, signature };
    } catch (error: any) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  }

  // Disconnect wallet
  async disconnect(): Promise<void> {
    try {
      this.state.isConnected = false;
      this.state.address = null;
      
      localStorage.removeItem('ronin_address');
      localStorage.removeItem('ronin_signature');
      localStorage.removeItem('ronin_message');
      
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }

  // Get current address
  getAddress(): string | null {
    return this.state.address;
  }

  // Check if connected
  isConnected(): boolean {
    return this.state.isConnected;
  }

  // Get current state
  getState(): WalletState {
    return { ...this.state };
  }

  // Restore connection from localStorage
  async restoreConnection(): Promise<boolean> {
    try {
      const address = localStorage.getItem('ronin_address');
      
      if (address && this.provider) {
        // Verify connection is still valid
        try {
          const accounts = await this.provider.request({
            method: 'eth_accounts',
          });
          
          if (accounts && accounts.includes(address)) {
            this.state.isConnected = true;
            this.state.address = address;
            this.notifyListeners();
            return true;
          }
        } catch (error) {
          // Connection lost, clear state
          await this.disconnect();
          return false;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Failed to restore connection:', error);
      return false;
    }
  }

  // Sign a message
  async signMessage(message: string): Promise<string | null> {
    try {
      if (!this.provider || !this.state.isConnected || !this.state.address) {
        throw new Error('Wallet not connected');
      }

      const signature = await this.provider.request({
        method: 'personal_sign',
        params: [message, this.state.address],
      });

      return signature;
    } catch (error) {
      console.error('Failed to sign message:', error);
      return null;
    }
  }

  // Get ERC-20 token balance
  async getTokenBalance(tokenAddress: string): Promise<string | null> {
    try {
      if (!this.provider || !this.state.isConnected || !this.state.address) {
        console.log('Cannot get balance: provider or address missing');
        return null;
      }

      // ERC-20 balanceOf function signature: balanceOf(address)
      // Function selector: 0x70a08231 (without 0x prefix for concatenation)
      const functionSelector = '70a08231';
      
      // Encode address parameter (remove 0x prefix, pad to 32 bytes)
      const addressParam = this.state.address.slice(2).toLowerCase().padStart(64, '0');
      const data = '0x' + functionSelector + addressParam; // Add 0x only once at the start

      console.log('Calling token balance:', {
        tokenAddress,
        userAddress: this.state.address,
        data: data
      });

      // Call contract - try different methods
      let result;
      try {
        // Method 1: eth_call (standard) - try with ronin_request if available
        const requestMethod = (this.provider as any).ronin_request || this.provider.request;
        result = await requestMethod.call(this.provider, {
          method: 'eth_call',
          params: [
            {
              to: tokenAddress,
              data: data, // data already has 0x prefix
            },
            'latest',
          ],
        });
        console.log('eth_call result:', result);
      } catch (ethCallError: any) {
        console.warn('eth_call failed, trying direct RPC:', ethCallError);
        // Method 2: Try direct RPC call to Ronin network
        try {
          // Ronin mainnet RPC endpoint
          const rpcUrl = 'https://api.roninchain.com/rpc';
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_call',
              params: [
                {
                  to: tokenAddress,
                  data: data, // data already has 0x prefix
                },
                'latest',
              ],
              id: 1,
            }),
          });
          
          const jsonResponse = await response.json();
          if (jsonResponse.result) {
            result = jsonResponse.result;
            console.log('Direct RPC result:', result);
          } else {
            throw new Error(jsonResponse.error?.message || 'RPC call failed');
          }
        } catch (error2: any) {
          console.error('All balance check methods failed:', error2);
          console.error('Error details:', {
            message: error2?.message,
            code: error2?.code,
            stack: error2?.stack
          });
          throw error2;
        }
      }

      if (result && result !== '0x' && result !== '0x0' && result !== '0x00') {
        // Convert hex to BigInt, then to string (handles 18 decimals)
        const balance = BigInt(result);
        // DOT has 18 decimals
        const balanceFormatted = (Number(balance) / 1e18).toFixed(2);
        console.log('Token balance raw:', result, 'formatted:', balanceFormatted);
        return balanceFormatted;
      }

      console.log('Token balance is zero or empty, result:', result);
      return '0.00';
    } catch (error: any) {
      console.error('Failed to get token balance:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        data: error?.data
      });
      return null;
    }
  }

  // Subscribe to state changes
  onStateChange(listener: (state: WalletState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Listen to account changes
  setupAccountListener(): void {
    if (!this.provider) return;

    // Listen for account changes (EIP-1193 standard)
    try {
      if (this.provider.on) {
        this.provider.on('accountsChanged', (accounts: string[]) => {
          if (accounts.length === 0) {
            // User disconnected
            this.disconnect();
          } else if (accounts[0] !== this.state.address) {
            // Account changed
            this.state.address = accounts[0];
            localStorage.setItem('ronin_address', accounts[0]);
            this.notifyListeners();
          }
        });
        
        // Listen for disconnect
        this.provider.on('disconnect', () => {
          this.disconnect();
        });
      }
    } catch (error) {
      console.warn('Failed to setup account listener:', error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }
}

// Export singleton instance
export const walletService = new WalletService();

// Setup account listener on initialization
if (typeof window !== 'undefined') {
  walletService.setupAccountListener();
}
