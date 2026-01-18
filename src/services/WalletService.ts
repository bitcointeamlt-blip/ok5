// Wallet Service for EIP-1193 wallets (Ronin + MetaMask)
// - Ronin Wallet uses window.ronin.provider
// - MetaMask uses window.ethereum (or window.ethereum.providers[])

export interface WalletState {
  isConnected: boolean;
  address: string | null;
}

export type WalletProviderType = 'ronin' | 'metamask';

interface Eip1193Provider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  isRonin?: boolean;
  isMetaMask?: boolean;
  on?: (event: string, callback: (...args: any[]) => void) => void;
  removeListener?: (event: string, callback: (...args: any[]) => void) => void;
}

function strip0x(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function isHexAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function pad32(hexNo0x: string): string {
  return hexNo0x.toLowerCase().padStart(64, '0');
}

function bigIntToHex(value: bigint): string {
  return value.toString(16);
}

class WalletService {
  private state: WalletState = {
    isConnected: false,
    address: null,
  };

  private listeners: Array<(state: WalletState) => void> = [];
  private providers: Partial<Record<WalletProviderType, Eip1193Provider>> = {};
  private provider: Eip1193Provider | null = null;
  private activeProviderType: WalletProviderType | null = null;

  constructor() {
    // Discover installed wallets (best-effort).
    if (typeof window !== 'undefined') {
      // Ronin
      try {
        const ronin = (window as any).ronin;
        if (ronin && ronin.provider && typeof ronin.provider.request === 'function') {
          this.providers.ronin = ronin.provider as Eip1193Provider;
        } else if (ronin && typeof ronin.request === 'function') {
          this.providers.ronin = ronin as Eip1193Provider;
        }
      } catch {}

      // MetaMask (may be window.ethereum or inside window.ethereum.providers[])
      try {
        const eth = (window as any).ethereum;
        let mm: any = null;
        if (eth) {
          if (Array.isArray(eth.providers)) {
            mm = eth.providers.find((p: any) => p && p.isMetaMask);
          } else if (eth.isMetaMask) {
            mm = eth;
          }
        }
        if (mm && typeof mm.request === 'function') {
          this.providers.metamask = mm as Eip1193Provider;
        }
      } catch {}

      // Restore preferred provider type early (if any)
      try {
        const storedType = localStorage.getItem('wallet_provider') as WalletProviderType | null;
        if (storedType === 'ronin' || storedType === 'metamask') {
          this.activeProviderType = storedType;
          this.provider = this.providers[storedType] || null;
        }
      } catch {}
    }
  }

  // Which wallets are available in this browser?
  getAvailableWallets(): { ronin: boolean; metamask: boolean } {
    return {
      ronin: !!this.providers.ronin,
      metamask: !!this.providers.metamask,
    };
  }

  // Connect to a wallet (Ronin or MetaMask)
  async connect(providerType?: WalletProviderType): Promise<{ address: string; signature: string } | null> {
    try {
      const available = this.getAvailableWallets();
      let typeToUse: WalletProviderType | null = providerType || null;

      if (!typeToUse) {
        // Auto-pick if only one is installed; otherwise require explicit choice.
        if (available.ronin && !available.metamask) typeToUse = 'ronin';
        else if (available.metamask && !available.ronin) typeToUse = 'metamask';
        else {
          // If both are installed, prefer last used if available.
          if (this.activeProviderType && (this.activeProviderType in this.providers)) {
            typeToUse = this.activeProviderType;
          }
        }
      }

      if (!typeToUse) {
        throw new Error('Wallet not selected. Please choose Ronin or MetaMask.');
      }

      const prov = this.providers[typeToUse];
      if (!prov) {
        throw new Error(`${typeToUse === 'ronin' ? 'Ronin Wallet' : 'MetaMask'} not installed.`);
      }

      this.provider = prov;
      this.activeProviderType = typeToUse;
      try {
        localStorage.setItem('wallet_provider', typeToUse);
      } catch {}

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
      // Keep legacy ronin_* keys for backward compatibility with existing game code.
      localStorage.setItem('ronin_address', address);
      localStorage.setItem('ronin_signature', signature);
      localStorage.setItem('ronin_message', message);
      // New generic keys (optional for future refactors)
      localStorage.setItem('wallet_address', address);
      localStorage.setItem('wallet_signature', signature);
      localStorage.setItem('wallet_message', message);

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
      this.provider = null;
      this.activeProviderType = null;
      
      localStorage.removeItem('ronin_address');
      localStorage.removeItem('ronin_signature');
      localStorage.removeItem('ronin_message');
      localStorage.removeItem('wallet_address');
      localStorage.removeItem('wallet_signature');
      localStorage.removeItem('wallet_message');
      localStorage.removeItem('wallet_provider');
      
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

  // Expose the underlying EIP-1193 provider for advanced integrations (ethers BrowserProvider, contract calls, etc.)
  // NOTE: Treat as read-only; only WalletService should manage connection state.
  getEip1193Provider(): Eip1193Provider | null {
    return this.provider;
  }

  async getChainId(): Promise<number | null> {
    try {
      if (!this.provider) return null;
      const requestMethod = (this.provider as any)?.ronin_request || this.provider.request;
      const hex: string = await requestMethod.call(this.provider, { method: "eth_chainId", params: [] });
      if (typeof hex !== "string" || !hex.startsWith("0x")) return null;
      const v = Number(BigInt(hex));
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  /**
   * Ensure the wallet is connected to Ronin mainnet (chainId 2020).
   * Attempts wallet_switchEthereumChain / wallet_addEthereumChain where supported (MetaMask).
   */
  async ensureRoninMainnet(): Promise<void> {
    if (!this.provider || !this.state.isConnected) {
      throw new Error("Wallet not connected");
    }
    const targetChainIdDec = 2020;
    const targetChainIdHex = "0x7e4"; // 2020
    const current = await this.getChainId();
    if (current === targetChainIdDec) return;

    const requestMethod = (this.provider as any)?.ronin_request || this.provider.request;
    try {
      await requestMethod.call(this.provider, {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainIdHex }],
      });
      return;
    } catch (e: any) {
      // MetaMask: 4902 = unknown chain, attempt add
      const code = e?.code;
      if (code === 4902 || (typeof e?.message === "string" && e.message.includes("4902"))) {
        try {
          await requestMethod.call(this.provider, {
            method: "wallet_addEthereumChain",
            params: [{
              chainId: targetChainIdHex,
              chainName: "Ronin Mainnet",
              nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
              rpcUrls: ["https://api.roninchain.com/rpc"],
              blockExplorerUrls: ["https://app.roninchain.com"],
            }],
          });
          return;
        } catch {}
      }
      throw new Error("Please switch wallet network to Ronin Mainnet (chainId 2020) and try again.");
    }
  }

  // Restore connection from localStorage
  async restoreConnection(): Promise<boolean> {
    try {
      const address = localStorage.getItem('wallet_address') || localStorage.getItem('ronin_address');
      const storedType = (localStorage.getItem('wallet_provider') as WalletProviderType | null);
      const preferred: WalletProviderType | null =
        (storedType === 'ronin' || storedType === 'metamask') ? storedType : null;

      // If we have a preferred type and it's available, use it; otherwise fall back to any available provider.
      const prov =
        (preferred ? this.providers[preferred] : null) ||
        this.providers.ronin ||
        this.providers.metamask ||
        null;

      if (address && prov) {
        this.provider = prov;
        if (preferred && this.providers[preferred]) this.activeProviderType = preferred;
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
        // Cannot get balance: provider or address missing
        return null;
      }

      // ERC-20 balanceOf function signature: balanceOf(address)
      // Function selector: 0x70a08231 (without 0x prefix for concatenation)
      const functionSelector = '70a08231';
      
      // Encode address parameter (remove 0x prefix, pad to 32 bytes)
      const addressParam = this.state.address.slice(2).toLowerCase().padStart(64, '0');
      const data = '0x' + functionSelector + addressParam; // Add 0x only once at the start

      // Call contract - try different methods
      let result;
      try {
        // Method 1: eth_call via wallet provider.
        // NOTE: For MetaMask this might fail if the user is not connected to Ronin chain,
        // so we fall back to direct Ronin RPC below.
        const requestMethod = (this.provider as any)?.ronin_request || this.provider.request;
        result = await requestMethod.call(this.provider, {
          method: 'eth_call',
          params: [{ to: tokenAddress, data }, 'latest'],
        });
      } catch (ethCallError: any) {
        // eth_call failed, trying direct RPC
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
          } else {
            throw new Error(jsonResponse.error?.message || 'RPC call failed');
          }
        } catch (error2: any) {
          // All balance check methods failed
          throw error2;
        }
      }

      if (result && result !== '0x' && result !== '0x0' && result !== '0x00') {
        // Convert hex to BigInt, then to string (handles 18 decimals)
        const balance = BigInt(result);
        // DOT has 18 decimals
        const balanceFormatted = (Number(balance) / 1e18).toFixed(2);
        return balanceFormatted;
      }

      return '0.00';
    } catch (error: any) {
      // Failed to get token balance
      return null;
    }
  }

  // Get ERC-20 decimals() via eth_call. Falls back to 18 on failure.
  async getErc20Decimals(tokenAddress: string): Promise<number> {
    try {
      if (!this.provider || !this.state.isConnected) return 18;
      if (!isHexAddress(tokenAddress)) return 18;

      // decimals() selector: 0x313ce567
      const data = '0x313ce567';
      const requestMethod = (this.provider as any)?.ronin_request || this.provider.request;
      let result: any;
      try {
        result = await requestMethod.call(this.provider, {
          method: 'eth_call',
          params: [{ to: tokenAddress, data }, 'latest'],
        });
      } catch {
        // fallback: direct Ronin RPC
        const rpcUrl = 'https://api.roninchain.com/rpc';
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: tokenAddress, data }, 'latest'],
            id: 1,
          }),
        });
        const jsonResponse = await response.json();
        result = jsonResponse?.result;
      }

      if (typeof result !== 'string' || !result.startsWith('0x')) return 18;
      const v = Number(BigInt(result));
      if (!Number.isFinite(v) || v < 0 || v > 36) return 18;
      return v;
    } catch {
      return 18;
    }
  }

  // Send an ERC-20 transfer() transaction using the active wallet provider.
  // NOTE: This assumes 18 decimals unless you provide amountWei explicitly.
  async sendErc20Transfer(params: {
    tokenAddress: string;
    to: string;
    amountWei: bigint;
  }): Promise<string> {
    if (!this.provider || !this.state.isConnected || !this.state.address) {
      throw new Error('Wallet not connected');
    }
    if (!isHexAddress(params.tokenAddress)) {
      throw new Error('Invalid token address');
    }
    if (!isHexAddress(params.to)) {
      throw new Error('Invalid recipient address');
    }
    if (params.amountWei <= 0n) {
      throw new Error('Invalid amount');
    }

    // ERC-20 transfer(address,uint256)
    // selector: a9059cbb
    const selector = 'a9059cbb';
    const toParam = pad32(strip0x(params.to));
    const amtParam = pad32(bigIntToHex(params.amountWei));
    const data = '0x' + selector + toParam + amtParam;

    const tx = {
      from: this.state.address,
      to: params.tokenAddress,
      data,
      value: '0x0',
    };

    const requestMethod = (this.provider as any)?.ronin_request || this.provider.request;
    const hash: string = await requestMethod.call(this.provider, {
      method: 'eth_sendTransaction',
      params: [tx],
    });

    if (!hash || typeof hash !== 'string') {
      throw new Error('Transaction failed');
    }
    return hash;
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
    // Attach listeners to all discovered providers; only the active provider can mutate state.
    const entries: Array<[WalletProviderType, Eip1193Provider]> = [];
    if (this.providers.ronin) entries.push(['ronin', this.providers.ronin]);
    if (this.providers.metamask) entries.push(['metamask', this.providers.metamask]);

    for (const [ptype, prov] of entries) {
      try {
        if (!prov.on) continue;
        prov.on('accountsChanged', (accounts: string[]) => {
          if (ptype !== this.activeProviderType) return;
          if (!accounts || accounts.length === 0) {
            this.disconnect();
          } else if (accounts[0] !== this.state.address) {
            this.state.address = accounts[0];
            try {
              localStorage.setItem('wallet_provider', ptype);
              localStorage.setItem('ronin_address', accounts[0]); // legacy
              localStorage.setItem('wallet_address', accounts[0]);
            } catch {}
            this.notifyListeners();
          }
        });
        prov.on('disconnect', () => {
          if (ptype !== this.activeProviderType) return;
          this.disconnect();
        });
      } catch (error) {
        console.warn('Failed to setup account listener:', error);
      }
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
