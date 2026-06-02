import { create } from 'zustand';

export const useTradingStore = create((set) => ({
  // Trading mode: 'paper' | 'live'
  mode: localStorage.getItem('trading_mode') || 'paper',

  // Whether Kite is connected for the logged-in user
  kiteConnected: false,
  setKiteConnected: (val) => set({ kiteConnected: val }),

  // Portfolio state
  portfolio: {
    holdings: [],
    cash: 0,
    totalValue: 0,
    buyingPower: 0,
  },

  // Active trades
  activeTrades: [],
  completedTrades: [],

  // Market data
  watchlist: [],
  quotes: {},

  // Trading state
  isTrading: false,
  selectedStock: null,

  // Actions
  setMode: (mode) => {
    localStorage.setItem('trading_mode', mode);
    set({ mode });
  },
  setPortfolio: (portfolio) => set({ portfolio }),
  setActiveTrades: (trades) => set({ activeTrades: trades }),
  setCompletedTrades: (trades) => set({ completedTrades: trades }),
  setWatchlist: (watchlist) => set({ watchlist }),
  setQuotes: (quotes) => set({ quotes }),
  setIsTrading: (isTrading) => set({ isTrading }),
  setSelectedStock: (stock) => set({ selectedStock: stock }),

  // Reset trading state
  reset: () => set({
    portfolio: { holdings: [], cash: 0, totalValue: 0, buyingPower: 0 },
    activeTrades: [],
    completedTrades: [],
    watchlist: [],
    quotes: {},
    isTrading: false,
    selectedStock: null,
  }),
}));
