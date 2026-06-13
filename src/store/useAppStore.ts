import { create } from "zustand";

export interface Account {
  accountSeq: string;
  accountName: string;
  accountType: string;
}

export interface Holding {
  symbol: string;
  symbolName: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  evaluationAmount: number;
  profitLoss: number;
  profitLossRate: number;
}

export interface Price {
  symbol: string;
  symbolName: string;
  currentPrice: number;
  changePrice: number;
  changeRate: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
}

interface AppStore {
  selectedAccount: Account | null;
  accounts: Account[];
  watchlist: string[];
  setSelectedAccount: (a: Account) => void;
  setAccounts: (a: Account[]) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
}

// 국내주식 기본 주요종목 (수수료 무료)
const DEFAULT_WATCHLIST = ["005930", "000660", "035420", "035720", "005380", "000270", "051910"];

export const useAppStore = create<AppStore>((set) => ({
  selectedAccount: null,
  accounts: [],
  watchlist: DEFAULT_WATCHLIST,
  setSelectedAccount: (a) => set({ selectedAccount: a }),
  setAccounts: (a) => set({ accounts: a }),
  addToWatchlist: (symbol) =>
    set((s) => ({
      watchlist: s.watchlist.includes(symbol) ? s.watchlist : [...s.watchlist, symbol.toUpperCase()],
    })),
  removeFromWatchlist: (symbol) =>
    set((s) => ({ watchlist: s.watchlist.filter((x) => x !== symbol) })),
}));
