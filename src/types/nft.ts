export interface NftItem {
  tokenId: string;
  name: string;
  image: string;
  description?: string;
  attributes?: any;
}

export interface NftState {
  nfts: NftItem[];
  isLoading: boolean;
  error: string | null;
  currentPage: number;
  totalPages: number;
}


