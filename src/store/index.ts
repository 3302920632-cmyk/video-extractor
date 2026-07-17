import { create } from 'zustand';
import { VideoInfo, ToastMessage, HistoryItem, User } from '../types';

interface AppState {
  currentVideo: VideoInfo | null;
  setCurrentVideo: (video: VideoInfo | null) => void;
  
  isExtracting: boolean;
  setIsExtracting: (extracting: boolean) => void;
  
  showQualitySection: boolean;
  toggleQualitySection: () => void;
  
  showShareSection: boolean;
  toggleShareSection: () => void;
  
  selectedResolution: string;
  setSelectedResolution: (resolution: string) => void;
  
  selectedFrameRate: string;
  setSelectedFrameRate: (fps: string) => void;
  
  selectedQuality: 'hd' | 'fullhd' | 'ultrahd';
  setSelectedQuality: (quality: 'hd' | 'fullhd' | 'ultrahd') => void;
  
  toasts: ToastMessage[];
  addToast: (message: string, type: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  
  user: User | null;
  setUser: (user: User | null) => void;
  
  history: HistoryItem[];
  setHistory: (history: HistoryItem[]) => void;
  addHistoryItem: (item: HistoryItem) => void;
  removeHistoryItem: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  currentVideo: null,
  setCurrentVideo: (video) => set({ currentVideo: video }),
  
  isExtracting: false,
  setIsExtracting: (extracting) => set({ isExtracting: extracting }),
  
  showQualitySection: false,
  toggleQualitySection: () => set((state) => ({ showQualitySection: !state.showQualitySection })),
  
  showShareSection: false,
  toggleShareSection: () => set((state) => ({ showShareSection: !state.showShareSection })),
  
  selectedResolution: '720p',
  setSelectedResolution: (resolution) => set({ selectedResolution: resolution }),
  
  selectedFrameRate: '30',
  setSelectedFrameRate: (fps) => set({ selectedFrameRate: fps }),
  
  selectedQuality: 'hd',
  setSelectedQuality: (quality) => set({ selectedQuality: quality }),
  
  toasts: [],
  addToast: (message, type) => set((state) => ({
    toasts: [...state.toasts, { id: Date.now().toString(), message, type }]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((toast) => toast.id !== id)
  })),
  
  user: null,
  setUser: (user) => set({ user: user }),
  
  history: [],
  setHistory: (history) => set({ history }),
  addHistoryItem: (item) => set((state) => ({ history: [item, ...state.history] })),
  removeHistoryItem: (id) => set((state) => ({ history: state.history.filter((item) => item.id !== id) })),
}));