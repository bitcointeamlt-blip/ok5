// NFT Service for Ronkeverse NFT collection
// Contract: 0x810b6d1374ac7ba0e83612e7d49f49a13f1de019
// Network: Ronin

import { ethers } from 'ethers';
import { NftItem } from '../types/nft';

// Minimal ERC-721 ABI
const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  // Some contracts use tokensOfOwner instead
  'function tokensOfOwner(address owner) view returns (uint256[])',
];

const RONKEVERSE_CONTRACT_ADDRESS = '0x810b6d1374ac7ba0e83612e7d49f49a13f1de019';
const RONIN_RPC_URL = 'https://api.roninchain.com/rpc';

class NftService {
  private provider: ethers.JsonRpcProvider | null = null;
  private contract: ethers.Contract | null = null;

  constructor() {
    // Initialize provider with Ronin RPC
    try {
      this.provider = new ethers.JsonRpcProvider(RONIN_RPC_URL);
      this.contract = new ethers.Contract(
        RONKEVERSE_CONTRACT_ADDRESS,
        ERC721_ABI,
        this.provider
      );
    } catch (error) {
      console.error('Failed to initialize NFT service:', error);
    }
  }

  // Get NFT balance for a wallet address
  async getNftBalance(walletAddress: string): Promise<number> {
    try {
      if (!this.contract) {
        throw new Error('NFT contract not initialized');
      }

      const balance = await this.contract.balanceOf(walletAddress);
      return Number(balance);
    } catch (error: any) {
      console.error('Failed to get NFT balance:', error);
      throw error;
    }
  }

  // Get all token IDs owned by a wallet
  async getTokenIds(walletAddress: string, balance: number): Promise<string[]> {
    try {
      if (!this.contract || balance === 0) {
        return [];
      }

      const tokenIds: string[] = [];

      // Try tokensOfOwner first (if contract supports it)
      try {
        const tokens = await this.contract.tokensOfOwner(walletAddress);
        return tokens.map((tokenId: bigint | string) => {
          if (typeof tokenId === 'bigint') {
            return tokenId.toString();
          }
          return String(tokenId);
        });
      } catch (error) {
        // Fallback to tokenOfOwnerByIndex
        // tokensOfOwner not available, using tokenOfOwnerByIndex
      }

      // Use tokenOfOwnerByIndex (standard ERC-721 Enumerable)
      for (let i = 0; i < balance; i++) {
        try {
          // Add delay between requests to avoid rate limiting
          if (i > 0) {
            await this.delay(200); // 200ms delay between token ID requests
          }
          
          const tokenId = await this.contract.tokenOfOwnerByIndex(walletAddress, i);
          // Convert BigInt to string properly
          const tokenIdStr = typeof tokenId === 'bigint' ? tokenId.toString() : String(tokenId);
          tokenIds.push(tokenIdStr);
        } catch (error: any) {
          console.error(`Failed to get token at index ${i}:`, error);
          
          // If rate limited, wait longer and retry
          if (error.message && (error.message.includes('Too many requests') || error.code === 'SERVER_ERROR')) {
            // Rate limited, waiting before retry
            await this.delay(2000);
            
            try {
              const tokenId = await this.contract.tokenOfOwnerByIndex(walletAddress, i);
              const tokenIdStr = typeof tokenId === 'bigint' ? tokenId.toString() : String(tokenId);
              tokenIds.push(tokenIdStr);
            } catch (retryError: any) {
              console.error(`Retry failed for token index ${i}:`, retryError);
              // Continue with next token
            }
          } else {
            // Continue with next token for other errors
          }
        }
      }

      return tokenIds;
    } catch (error: any) {
      console.error('Failed to get token IDs:', error);
      throw error;
    }
  }

  // Get token metadata from tokenURI
  async getTokenMetadata(tokenId: string): Promise<NftItem> {
    try {
      if (!this.contract) {
        throw new Error('NFT contract not initialized');
      }

      // Get tokenURI
      const tokenURI = await this.contract.tokenURI(tokenId);

      // Fetch metadata
      let metadataUrl = tokenURI;
      
      // Handle IPFS URLs
      if (tokenURI.startsWith('ipfs://')) {
        metadataUrl = `https://ipfs.io/ipfs/${tokenURI.replace('ipfs://', '')}`;
      } else if (tokenURI.startsWith('ipfs/')) {
        metadataUrl = `https://ipfs.io/${tokenURI}`;
      }

      // Fetch JSON metadata with CORS proxy fallback
      let response: Response;
      let metadata: any;
      
      try {
        // Try direct fetch first
        response = await fetch(metadataUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata: ${response.statusText}`);
        }
        metadata = await response.json();
      } catch (error: any) {
        // If CORS error, try using CORS proxy
        if (error.message && (error.message.includes('CORS') || error.message.includes('fetch'))) {
          // CORS error, trying CORS proxy
          
          // Try CORS proxy (public CORS proxy service)
          const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(metadataUrl)}`;
          
          try {
            response = await fetch(proxyUrl);
            if (!response.ok) {
              throw new Error(`Proxy fetch failed: ${response.statusText}`);
            }
            metadata = await response.json();
            // Successfully fetched metadata via proxy
          } catch (proxyError: any) {
            console.error(`Proxy also failed for token ${tokenId}:`, proxyError);
            throw error; // Throw original error
          }
        } else {
          throw error;
        }
      }

      // Handle image URL (may be IPFS or S3)
      let imageUrl = metadata.image || metadata.image_url || metadata.imageUrl || metadata.imageURI || '';
      
      // Handle relative URLs (if imageUrl starts with /, prepend base URL)
      if (imageUrl && imageUrl.startsWith('/') && !imageUrl.startsWith('//')) {
        // Extract base URL from metadataUrl
        try {
          const metadataUrlObj = new URL(metadataUrl);
          imageUrl = `${metadataUrlObj.protocol}//${metadataUrlObj.host}${imageUrl}`;
        } catch (e) {
          // If metadataUrl is not a valid URL, try to extract base from it
          if (metadataUrl.includes('s3.amazonaws.com')) {
            const s3Match = metadataUrl.match(/(https?:\/\/[^\/]+)/);
            if (s3Match) {
              imageUrl = `${s3Match[1]}${imageUrl}`;
            }
          }
        }
      }
      
      // Handle IPFS URLs
      if (imageUrl.startsWith('ipfs://')) {
        imageUrl = `https://ipfs.io/ipfs/${imageUrl.replace('ipfs://', '')}`;
      } else if (imageUrl.startsWith('ipfs/')) {
        imageUrl = `https://ipfs.io/${imageUrl}`;
      }
      
      // S3 URLs work with crossOrigin='anonymous' in Image element
      // Data URLs (base64 encoded images) are handled directly

      return {
        tokenId,
        name: metadata.name || `Ronkeverse #${tokenId}`,
        image: imageUrl,
        description: metadata.description,
        attributes: metadata.attributes || metadata.traits,
      };
    } catch (error: any) {
      console.error(`Failed to get metadata for token ${tokenId}:`, error);
      
      // Return fallback metadata
      return {
        tokenId,
        name: `Ronkeverse #${tokenId}`,
        image: '',
        description: 'Metadata unavailable',
      };
    }
  }

  // Delay function to avoid rate limiting
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Main function to load all NFTs for a wallet
  async loadPlayerNfts(walletAddress: string): Promise<NftItem[]> {
    try {
      // Loading NFTs for wallet (address not logged for security)

      // Get balance
      const balance = await this.getNftBalance(walletAddress);

      if (balance === 0) {
        return [];
      }

      // Add delay to avoid rate limiting
      await this.delay(500);

      // Get all token IDs
      const tokenIds = await this.getTokenIds(walletAddress, balance);

      if (tokenIds.length === 0) {
        return [];
      }

      // Fetch metadata for each token with delays to avoid rate limiting
      const nfts: NftItem[] = [];
      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i];
        
        try {
          // Add delay between requests (except for first one)
          if (i > 0) {
            await this.delay(300); // 300ms delay between requests
          }
          
          const nft = await this.getTokenMetadata(tokenId);
          nfts.push(nft);
        } catch (error: any) {
          console.error(`Failed to load metadata for token ${tokenId}:`, error);
          
          // If rate limited, add longer delay and retry once
          if (error.message && error.message.includes('Too many requests')) {
            // Rate limited, waiting before retry
            await this.delay(2000);
            
            try {
              const nft = await this.getTokenMetadata(tokenId);
              nfts.push(nft);
            } catch (retryError: any) {
              console.error(`Retry failed for token ${tokenId}:`, retryError);
              // Add fallback NFT with tokenId but no image
              nfts.push({
                tokenId,
                name: `Ronkeverse #${tokenId}`,
                image: '',
                description: 'Metadata unavailable (rate limited)',
              });
            }
          } else {
            // Add fallback NFT for other errors
            nfts.push({
              tokenId,
              name: `Ronkeverse #${tokenId}`,
              image: '',
              description: 'Metadata unavailable',
            });
          }
        }
      }

      return nfts;
    } catch (error: any) {
      console.error('Failed to load player NFTs:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const nftService = new NftService();

